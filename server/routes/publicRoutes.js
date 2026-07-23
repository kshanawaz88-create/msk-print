const crypto = require("crypto");
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

console.log("✅ publicRoutes.js loaded");

// ======================================================
// Upload configuration
// ======================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 20 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
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

    const message =
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
        ? "File size cannot exceed 20 MB"
        : error.message || "Invalid upload request";

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

const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(
      file.originalname
    ).replace(/\s+/g, "_");

    const stream =
      cloudinary.uploader.upload_stream(
        {
          folder: "msk-print",
          resource_type: "raw",
          type: "authenticated",
          public_id: `${Date.now()}-${safeName}`,
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
    throw new Error(
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
    throw new Error("Invalid print type");
  }

  if (
    !["Single Side", "Double Side"].includes(
      side
    )
  ) {
    throw new Error("Invalid printing side");
  }

  if (!["A4", "A3"].includes(paperSize)) {
    throw new Error("Invalid paper size");
  }

  return {
    copies,
    printType,
    side,
    paperSize,
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
          options
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
      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to calculate price",
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
    console.log("✅ ORDERS ROUTE HIT", {
      shopCode: req.params.shopCode,
      fileReceived: Boolean(req.file),
    });

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

      const options = validatePrintOptions(
        req.body
      );

      stage = "page-count";

      let pages = 1;

      if (
        req.file.mimetype ===
        "application/pdf"
      ) {
        const parsedPdf = await pdfParse(
          req.file.buffer
        );

        pages = parsedPdf.numpages;

        if (
          !Number.isInteger(pages) ||
          pages < 1
        ) {
          throw new Error(
            "Unable to determine PDF page count"
          );
        }
      }

      stage = "price-calculation";

      const calculated =
        await calculatePrice(
          pages,
          options
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

      stage = "print-job-create";

      const job = await PrintJob.create({
        shopId: shop._id,
        user: null,
        isGuestOrder: true,

        publicOrderTokenHash,

        publicOrderExpiresAt: new Date(
          Date.now() +
            7 * 24 * 60 * 60 * 1000
        ),

        fileName: sanitizeFileName(
          req.file.originalname
        ),

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
          req.file.mimetype,

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
          console.error(
            "Public upload cleanup failed:",
            cleanupError.message
          );
        }
      }

      console.error(
        "Public order creation failed:",
        {
          stage,
          name: error.name,
          message: error.message,
          fileReceived:
            Boolean(req.file),
          cloudinaryCompleted:
            Boolean(
              uploadedFile?.secure_url
            ),
          jobCreated,
        }
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to create print order",
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
          invoiceNumber:
            job.paymentStatus === "Paid"
              ? job.invoiceNumber || ""
              : "",
          createdAt: job.createdAt,

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

// ======================================================
// Temporary diagnostic endpoint
// Remove after testing
// ======================================================

router.get(
  "/debug/shops",
  async (_req, res, next) => {
    try {
      const shops = await Shop.find({})
        .select(
          "shopName shopCode isActive"
        )
        .lean();

      return res.json({
        success: true,
        database: Shop.db.name,
        count: shops.length,
        shops,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;