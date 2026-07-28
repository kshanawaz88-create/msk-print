const crypto = require("crypto");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const cloudinary = require("../config/cloudinary");
const Shop = require("../models/Shop");
const PrintJob = require("../models/printJob");
const { calculatePrice } = require("../utils/pricing");
const { uploadLimiter } = require("../middleware/rateLimits");
const paymentService = require(
  "../services/shopPaymentService"
);

const router = express.Router();
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Map([
  ["application/pdf", new Set([".pdf"])],
  ["image/png", new Set([".png"])],
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
]);

// ======================================================
// Upload configuration
// ======================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },

  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_FILE_TYPES.has(String(file.mimetype || "").toLowerCase())) {
      return callback(
        new Error(
          "Only PDF, PNG and JPG files are supported"
        )
      );
    }

    callback(null, true);
  },
});

const parseUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      return next();
    }

    let message = "Invalid upload request";
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      message = "File size cannot exceed 20 MB";
    } else if (
      error instanceof multer.MulterError &&
      ["LIMIT_UNEXPECTED_FILE", "LIMIT_FILE_COUNT"].includes(error.code)
    ) {
      message = "Upload exactly one file using the file field";
    } else if (error.message === "Only PDF, PNG and JPG files are supported") {
      message = error.message;
    }

    return res.status(400).json({
      success: false,
      message,
      stage: "multipart-validation",
    });
  });
};

// ======================================================
// Helpers
// ======================================================

const normalizeShopCode = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

const validShopCode = (value) =>
  /^[A-Z0-9-]{3,50}$/.test(value);

const findPublicShop = (shopCode) =>
  Shop.findOne({
    shopCode,
    isActive: true,
  });

const sanitizeFileName = (fileName) => {
  const cleaned = String(fileName || "document")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim()
    .slice(0, 180);

  return cleaned || "document";
};

const createPublicOrderToken = () =>
  crypto.randomBytes(32).toString("hex");

const hashPublicOrderToken = (token) =>
  crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

const publicInputError = (message) => {
  const error = new Error(message);
  error.status = 400;
  error.expose = true;
  return error;
};

const safeOrderFailure = (error, stage) => {
  if (error?.expose === true && Number(error.status) < 500) {
    return { status: error.status || 400, message: error.message };
  }
  if (stage === "page-count") {
    return { status: 400, message: "The PDF could not be read or has no printable pages" };
  }
  if (stage === "price-calculation") {
    return { status: 503, message: "Pricing is temporarily unavailable for this shop" };
  }
  if (stage === "shop-lookup") {
    return { status: 503, message: "This shop is temporarily unavailable" };
  }
  if (stage === "cloudinary-upload") {
    return { status: 502, message: "Unable to store the uploaded file. Please try again" };
  }
  if (stage === "print-job-create") {
    return { status: 500, message: "Unable to create the print order. Please try again" };
  }
  return { status: 400, message: "Invalid print order request" };
};

const logPublicOrderFailure = (error, context) => {
  const details = {
    ...context,
    name: error?.name || "Error",
    code: error?.code || error?.http_code || undefined,
  };
  if (process.env.NODE_ENV !== "production") details.message = error?.message;
  console.error("Public order creation failed:", details);
};

const detectFileType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ) &&
    buffer.subarray(12, 16).equals(Buffer.from("IHDR")) &&
    buffer.readUInt32BE(16) > 0 &&
    buffer.readUInt32BE(20) > 0
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer.length >= 4 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 5 &&
    buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from("%PDF-"))
  ) {
    return "application/pdf";
  }

  return null;
};

const validateUploadedFile = (file) => {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw publicInputError("Please select a PDF, PNG or JPG file");
  }
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    throw publicInputError("File size cannot exceed 20 MB");
  }

  const detectedType = detectFileType(file.buffer);
  const declaredType = String(file.mimetype || "").toLowerCase();
  if (!detectedType || detectedType !== declaredType) {
    throw publicInputError(
      "The file content does not match a supported PDF, PNG or JPG file"
    );
  }

  const fileName = sanitizeFileName(file.originalname);
  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_FILE_TYPES.get(detectedType)?.has(extension)) {
    throw publicInputError("The file extension does not match its content");
  }

  return { detectedType, fileName };
};

const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream =
      cloudinary.uploader.upload_stream(
        {
          folder: "msk-print",
          resource_type: "raw",
          type: "authenticated",
          public_id: crypto.randomUUID(),
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );

    stream.end(file.buffer);
  });

const removeCloudinaryUpload = async (
  uploadedFile
) => {
  if (!uploadedFile?.public_id) {
    return;
  }

  await cloudinary.uploader.destroy(
    uploadedFile.public_id,
    {
      resource_type: "raw",
      type:
        uploadedFile.type ||
        "authenticated",
      invalidate: true,
    }
  );
};

const validatePrintOptions = (body) => {
  const copies = Number(body.copies);

  if (
    !Number.isInteger(copies) ||
    copies < 1 ||
    copies > 999
  ) {
    throw publicInputError(
      "Copies must be between 1 and 999"
    );
  }

  const printType = body.printType;
  const side = body.side;
  const paperSize = body.paperSize;

  if (
    !["Black & White", "Color"].includes(
      printType
    )
  ) {
    throw publicInputError("Invalid print type");
  }

  if (
    !["Single Side", "Double Side"].includes(
      side
    )
  ) {
    throw publicInputError("Invalid printing side");
  }

  if (!["A4", "A3"].includes(paperSize)) {
    throw publicInputError("Invalid paper size");
  }

  return {
    copies,
    printType,
    side,
    paperSize,
  };
};

const sanitizeGuestDetails = (body = {}) => {
  const guestName = String(body.customerName || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (guestName.length > 100) {
    throw publicInputError("Customer name cannot exceed 100 characters");
  }

  const rawMobile = String(body.mobileNumber || "").trim();
  const guestMobile = rawMobile.replace(/[\s()-]/g, "");
  if (guestMobile && !/^\+?[0-9]{7,15}$/.test(guestMobile)) {
    throw publicInputError("Mobile number must contain 7 to 15 digits");
  }

  const guestEmail = String(body.email || "").trim().toLowerCase();
  if (
    guestEmail &&
    (guestEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail))
  ) {
    throw publicInputError("Email address is invalid");
  }

  return { guestName, guestMobile, guestEmail };
};

const queueTrackingFor = async (job) => {
  if (job.paymentStatus !== "Paid" || job.status !== "Pending") {
    return { queuePosition: null, estimatedWaitMinutes: null };
  }

  const beforeThisOrder = {
    shopId: job.shopId,
    paymentStatus: "Paid",
    status: "Pending",
    $or: [
      { createdAt: { $lt: job.createdAt } },
      { createdAt: job.createdAt, _id: { $lt: job._id } },
    ],
  };
  const [queuePosition, workload] = await Promise.all([
    PrintJob.countDocuments(beforeThisOrder).then((count) => count + 1),
    PrintJob.aggregate([
      { $match: beforeThisOrder },
      {
        $group: {
          _id: null,
          units: {
            $sum: {
              $multiply: [
                { $cond: [{ $gt: ["$pages", 0] }, "$pages", 1] },
                { $cond: [{ $gt: ["$copies", 0] }, "$copies", 1] },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const configuredMinutes = Number(process.env.PRINT_AGENT_MINUTES_PER_PAGE);
  const minutesPerPage =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0 && configuredMinutes <= 60
      ? configuredMinutes
      : 0.1;
  const unitsAhead = Number(workload[0]?.units) || 0;

  return {
    queuePosition,
    estimatedWaitMinutes: Number((unitsAhead * minutesPerPage).toFixed(1)),
  };
};

// ======================================================
// Public shop details
// GET /api/public/shops/:shopCode
// ======================================================

router.get(
  "/shops/:shopCode",
  async (req, res, next) => {
    try {
      const shopCode = normalizeShopCode(
        req.params.shopCode
      );

      if (!validShopCode(shopCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid shop code",
        });
      }

      const shop = await findPublicShop(
        shopCode
      ).select(
        [
          "shopName",
          "shopCode",
          "branchName",
          "address",
          "city",
          "state",
          "country",
          "postalCode",
          "phone",
          "email",
          "website",
          "logo",
          "currency",
          "themeColor",
          "openingTime",
          "closingTime",
          "paymentEnabled",
          "paymentMode",
          "paymentInstructions",
        ].join(" ")
      );

      if (!shop) {
        return res.status(404).json({
          success: false,
          message:
            "Shop not found or currently unavailable",
        });
      }

      return res.json({
        success: true,

        shop: {
          id: shop._id,
          shopName: shop.shopName,
          shopCode: shop.shopCode,
          branchName:
            shop.branchName || "Main Branch",
          address: shop.address || "",
          city: shop.city || "",
          state: shop.state || "",
          country:
            shop.country || "India",
          postalCode:
            shop.postalCode || "",
          phone: shop.phone || "",
          email: shop.email || "",
          website: shop.website || "",
          logo: shop.logo || "",
          currency: shop.currency || "₹",
          themeColor:
            shop.themeColor || "#0d6efd",
          openingTime:
            shop.openingTime || "",
          closingTime:
            shop.closingTime || "",
          paymentEnabled:
            shop.paymentEnabled !== false,
          paymentMode:
            shop.paymentMode || "both",
          paymentInstructions:
            shop.paymentInstructions || "",
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ======================================================
// Public price quote
// POST /api/public/shops/:shopCode/quote
// ======================================================

router.post(
  "/shops/:shopCode/quote",
  async (req, res, next) => {
    try {
      const shopCode = normalizeShopCode(
        req.params.shopCode
      );

      if (!validShopCode(shopCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid shop code",
        });
      }

      const shop = await findPublicShop(
        shopCode
      ).select(
        "currency paymentEnabled"
      );

      if (!shop) {
        return res.status(404).json({
          success: false,
          message:
            "Shop not found or currently unavailable",
        });
      }

      if (shop.paymentEnabled === false) {
        return res.status(400).json({
          success: false,
          message:
            "Online ordering is disabled for this shop",
        });
      }

      const pages = Number(req.body.pages);

      if (
        !Number.isInteger(pages) ||
        pages < 1 ||
        pages > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid page count",
        });
      }

      const options = validatePrintOptions(
        req.body
      );

      const calculated =
        await calculatePrice(
          pages,
          options,
          shop._id
        );

      return res.json({
        success: true,

        quote: {
          ...calculated,
          pages,
          currency:
            shop.currency || "₹",
          total: calculated.price,
        },
      });
    } catch (error) {
      if (error.status === 400 && error.expose !== false) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      logPublicOrderFailure(error, { stage: "public-quote" });
      return res.status(503).json({
        success: false,
        message: "Pricing is temporarily unavailable for this shop",
      });
    }
  }
);

// ======================================================
// Create public guest order
// POST /api/public/shops/:shopCode/orders
// ======================================================

router.post(
  "/shops/:shopCode/orders",
  uploadLimiter,
  parseUpload,
  async (req, res) => {
    let uploadedFile = null;
    let jobCreated = false;
    let stage = "request-validation";

    try {
      const shopCode = normalizeShopCode(
        req.params.shopCode
      );

      if (!validShopCode(shopCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid shop code",
          stage,
        });
      }

      stage = "shop-lookup";

      const shop = await findPublicShop(
        shopCode
      ).select(
        "_id shopName shopCode currency paymentEnabled"
      );

      if (!shop) {
        return res.status(404).json({
          success: false,
          message:
            "Shop not found or currently unavailable",
          stage,
        });
      }

      if (shop.paymentEnabled === false) {
        return res.status(400).json({
          success: false,
          message:
            "Online ordering is disabled for this shop",
          stage,
        });
      }

      stage = "file-validation";
      const validatedFile = validateUploadedFile(req.file);
      const guestDetails = sanitizeGuestDetails(req.body);

      const options = validatePrintOptions(
        req.body
      );

      stage = "page-count";

      let pages = 1;

      if (
        validatedFile.detectedType ===
        "application/pdf"
      ) {
        const parsedPdf = await pdfParse(
          req.file.buffer
        );

        pages = parsedPdf.numpages;

        if (
          !Number.isInteger(pages) ||
          pages < 1 ||
          pages > 10000
        ) {
          throw publicInputError("PDF page count must be between 1 and 10000");
        }
      }

      stage = "price-calculation";

      const calculated =
        await calculatePrice(
          pages,
          options,
          shop._id
        );

      const publicOrderToken =
        createPublicOrderToken();

      const publicOrderTokenHash =
        hashPublicOrderToken(
          publicOrderToken
        );

      stage = "cloudinary-upload";

      uploadedFile =
        await uploadToCloudinary(
          req.file
        );

      if (!uploadedFile?.public_id || !uploadedFile?.secure_url) {
        const storageError = new Error("Storage provider returned an incomplete upload result");
        storageError.code = "INCOMPLETE_UPLOAD_RESULT";
        throw storageError;
      }

      stage = "print-job-create";

      const job = await PrintJob.create({
        shopId: shop._id,
        user: null,
        isGuestOrder: true,

        ...guestDetails,

        publicOrderTokenHash,

        publicOrderExpiresAt: new Date(
          Date.now() +
            7 * 24 * 60 * 60 * 1000
        ),

        fileName: validatedFile.fileName,

        filePath:
          uploadedFile.secure_url,

        fileUrl:
          uploadedFile.secure_url,

        cloudinaryPublicId:
          uploadedFile.public_id,

        cloudinaryDeliveryType:
          uploadedFile.type ||
          "authenticated",

        fileMimeType:
          validatedFile.detectedType,

        fileSize:
          req.file.size,

        pages,

        copies: calculated.copies,
        printType:
          calculated.printType,
        side: calculated.side,
        paperSize:
          calculated.paperSize,
        colorMode:
          calculated.printType,
        price: calculated.price,

        currency: "INR",
        paymentStatus: "Pending",
        status: "Pending",
      });

      jobCreated = true;

      return res.status(201).json({
        success: true,
        message:
          "Print order created successfully",

        orderToken:
          publicOrderToken,

        order: {
          id: job._id,
          fileName: job.fileName,
          pages: job.pages,
          copies: job.copies,
          printType: job.printType,
          side: job.side,
          paperSize: job.paperSize,
          price: job.price,
          currency:
            shop.currency || "₹",
          paymentStatus:
            job.paymentStatus,
          status: job.status,
          customer: {
            name: job.guestName || "Guest Customer",
          },

          shop: {
            id: shop._id,
            shopName: shop.shopName,
            shopCode: shop.shopCode,
          },
        },
      });
    } catch (error) {
      if (
        uploadedFile?.public_id &&
        !jobCreated
      ) {
        try {
          await removeCloudinaryUpload(
            uploadedFile
          );
        } catch (cleanupError) {
          console.error("Public upload cleanup failed:", {
            code: cleanupError?.code || cleanupError?.http_code || undefined,
          });
        }
      }

      const failure = safeOrderFailure(error, stage);
      if (failure.status >= 500) {
        logPublicOrderFailure(error, {
          stage,
          fileReceived: Boolean(req.file),
          cloudinaryCompleted: Boolean(uploadedFile?.secure_url),
          jobCreated,
        });
      }

      return res.status(failure.status).json({
        success: false,
        message: failure.message,
        stage,
      });
    }
  }
);

// ======================================================
// Load public guest order
// GET /api/public/orders/:orderToken?shopCode=MSK-ABC001
// ======================================================

router.get(
  "/orders/:orderToken",
  async (req, res, next) => {
    try {
      const orderToken =
        typeof req.params.orderToken === "string"
          ? req.params.orderToken.trim()
          : "";

      const shopCode = normalizeShopCode(
        req.query.shopCode
      );

      if (!/^[a-f0-9]{64}$/i.test(orderToken)) {
        return res.status(400).json({
          success: false,
          message: "Invalid public order token",
        });
      }

      if (!validShopCode(shopCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid shop code",
        });
      }

      const tokenHash =
        hashPublicOrderToken(orderToken);

      const job = await PrintJob.findOne({
        publicOrderTokenHash: tokenHash,
        isGuestOrder: true,
      }).select(
        "+publicOrderTokenHash +publicOrderExpiresAt"
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message:
            "Public order not found or no longer available",
        });
      }

      if (
        job.publicOrderExpiresAt &&
        job.publicOrderExpiresAt.getTime() <
          Date.now()
      ) {
        return res.status(410).json({
          success: false,
          message:
            "This public order link has expired",
        });
      }

      const shop =
        await paymentService.findShopWithPaymentSecrets(
          job.shopId
        );

      if (
        !shop ||
        shop.isActive === false ||
        shop.shopCode !== shopCode
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Public order not found or no longer available",
        });
      }

      const payment =
        paymentService.buildPublicPaymentConfiguration(
          shop
        );
      const queueTracking = await queueTrackingFor(job);

      return res.json({
        success: true,

        order: {
          _id: job._id,
          fileName: job.fileName,
          pages: job.pages,
          copies: job.copies,
          printType: job.printType,
          side: job.side,
          paperSize: job.paperSize,
          price: job.price,
          currency: job.currency || "INR",
          paymentStatus: job.paymentStatus,
          paymentMethod: job.paymentMethod,
          status: job.status,
          ...queueTracking,
          invoiceNumber:
            job.paymentStatus === "Paid"
              ? job.invoiceNumber || ""
              : "",
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          printStartedAt: job.printStartedAt || null,
          printCompletedAt: job.printCompletedAt || null,
          errorReason: job.errorReason || "",
          customer: {
            name: job.guestName || "Guest Customer",
          },

          shop: {
            id: shop._id,
            shopName: shop.shopName,
            shopCode: shop.shopCode,
          },
        },

        shop: {
          id: shop._id,
          shopName: shop.shopName,
          shopCode: shop.shopCode,
          currency: shop.currency || "₹",
        },

        payment,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
