const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mongoose = require("mongoose");

const cloudinary = require("../config/cloudinary");
const PrintJob = require("../models/printJob");
const Shop = require("../models/Shop");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { calculatePrice } = require("../utils/pricing");
const { uploadLimiter } = require("../middleware/rateLimits");
const { validatePrintUpdate } = require("../middleware/validate");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    callback(allowed.includes(file.mimetype) ? null : new Error("Only PDF, PNG and JPG files are supported"), allowed.includes(file.mimetype));
  },
});
const parseUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "File size cannot exceed 20 MB"
      : error.message || "Invalid upload request";
    console.warn("Upload rejected:", {
      stage: "multipart-validation",
      code: error.code || error.name,
      message,
    });
    return res.status(400).json({
      success: false,
      message,
      stage: "multipart-validation",
    });
  });
};

const uploadToCloudinary = (file) => new Promise((resolve, reject) => {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "msk-print",
      resource_type: "raw",
      type: "authenticated",
      public_id: `${Date.now()}-${safeName}`,
    },
    (error, result) => error ? reject(error) : resolve(result)
  );
  stream.end(file.buffer);
});

const populateJob = (query) => query
  .populate("shopId", "shopName branchName")
  .populate("user", "fullName email")
  .populate("assignedStaff", "fullName email assignedPrinter")
  .populate("paymentVerifiedBy", "fullName email");

const canAccess = (job, user) => {
  if (user.role === "admin") return true;
  if (user.role === "shopOwner") return job.shopId?._id?.toString() === user.shopId?.toString();
  if (user.role === "staff") return job.assignedStaff?._id?.toString() === user.id;
  return job.user?._id?.toString() === user.id;
};
const statusTransitions = {
  Pending: ["Printing", "Cancelled"],
  Printing: ["Ready", "Cancelled"],
  Ready: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};
const canTransition = (current, next) =>
  current === next || statusTransitions[current]?.includes(next);
const paymentFields = [
  "paymentStatus",
  "paymentMethod",
  "price",
  "razorpayOrderId",
  "razorpayPaymentId",
  "razorpaySignature",
  "upiReference",
  "paymentVerifiedAt",
  "paymentVerifiedBy",
  "invoiceNumber",
];

router.post("/", uploadLimiter, protect, parseUpload, async (req, res) => {
  let uploadedFile = null;
  let jobCreated = false;
  let stage = "request-validation";
  const uploadDebug = process.env.NODE_ENV !== "production" &&
    process.env.UPLOAD_DEBUG === "true";
  try {
    if (uploadDebug) {
      console.debug("Upload stage:", {
        stage,
        fileReceived: Boolean(req.file),
        userReceived: Boolean(req.user?.id),
        role: req.user?.role,
      });
    }
    if (!req.file) {
      console.warn("Upload rejected:", { stage, reason: "No multipart file field named file" });
      return res.status(400).json({
        success: false,
        message: "Please select a file using the form field named file",
        stage,
      });
    }

    let pages = 1;
    if (req.file.mimetype === "application/pdf") {
      stage = "pdf-parse";
      pages = (await pdfParse(req.file.buffer)).numpages;
      if (!Number.isInteger(pages) || pages < 1) {
        throw new Error("Unable to determine PDF page count");
      }
      if (uploadDebug) console.debug("Upload stage:", { stage, succeeded: true, pages });
    }

    stage = "shop-lookup";
    let requestedShop;
    if (["shopOwner", "staff"].includes(req.user.role)) {
      requestedShop = req.user.shopId
        ? await Shop.findOne({ _id: req.user.shopId, isActive: true })
        : null;
    } else if (req.user.shopId) {
      requestedShop = await Shop.findOne({
        _id: req.user.shopId,
        isActive: true,
      });
    } else if (
      req.body.shopId &&
      mongoose.isValidObjectId(req.body.shopId)
    ) {
      requestedShop = await Shop.findOne({ _id: req.body.shopId, isActive: true });
    } else {
      const activeShops = await Shop.find({ isActive: true })
        .select("_id")
        .limit(2);
      requestedShop = activeShops.length === 1
        ? await Shop.findById(activeShops[0]._id)
        : null;
    }
    if (!requestedShop) {
      console.warn("Upload rejected:", {
        stage,
        reason: "No active shop matched the authenticated user",
        role: req.user.role,
        userHasShopId: Boolean(req.user.shopId),
      });
      return res.status(400).json({
        success: false,
        message: "Select an active shop before uploading",
        stage,
      });
    }

    stage = "cloudinary-upload";
    uploadedFile = await uploadToCloudinary(req.file);
    if (uploadDebug) {
      console.debug("Upload stage:", { stage, succeeded: Boolean(uploadedFile?.secure_url) });
    }

    stage = "print-job-create";
    const job = await PrintJob.create({
      shopId: requestedShop._id,
      user: req.user.id,
      fileName: req.file.originalname,
      filePath: uploadedFile.secure_url,
      fileUrl: uploadedFile.secure_url,
      cloudinaryPublicId: uploadedFile.public_id,
      cloudinaryDeliveryType: uploadedFile.type || "authenticated",
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size,
      pages,
      assignedStaff: req.user.role === "staff" ? req.user.id : null,
    });
    jobCreated = true;
    if (uploadDebug) {
      console.debug("Upload stage:", {
        stage,
        succeeded: true,
        shopFound: Boolean(requestedShop?._id),
        jobCreated: true,
      });
    }

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      job,
    });
  } catch (error) {
    if (uploadedFile?.public_id && !jobCreated) {
      try {
        await cloudinary.uploader.destroy(uploadedFile.public_id, {
          resource_type: "raw",
          type: uploadedFile.type || "authenticated",
          invalidate: true,
        });
      } catch (cleanupError) {
        console.error("Cloudinary cleanup failed:", cleanupError.message);
      }
    }
    console.error("Upload rejected:", {
      stage,
      name: error.name,
      message: error.message,
      fileReceived: Boolean(req.file),
      userReceived: Boolean(req.user?.id),
      cloudinaryCompleted: Boolean(uploadedFile?.secure_url),
      jobCreated,
    });
    return res.status(400).json({
      success: false,
      message: error.message || "Upload failed",
      stage,
    });
  }
});

router.get("/", protect, async (req, res) => {
  try {
    const filters = req.user.role === "admin"
      ? {}
      : req.user.role === "shopOwner"
      ? { shopId: req.user.shopId }
      : req.user.role === "staff"
      ? { assignedStaff: req.user.id }
      : { user: req.user.id };

    const orders = await populateJob(PrintJob.find(filters)).sort({ createdAt: -1 });
    return res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to fetch orders" });
  }
});

router.get("/:id", protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const job = await populateJob(PrintJob.findById(req.params.id));
    if (!job) return res.status(404).json({ success: false, message: "Order not found" });
    if (!canAccess(job, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    return res.json({ success: true, job });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }
});

router.put("/:id", protect, validatePrintUpdate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const job = await PrintJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: "Order not found" });

    const scopedJob = await populateJob(PrintJob.findById(job._id));
    if (!canAccess(scopedJob, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (paymentFields.some((field) => req.body[field] !== undefined)) {
      return res.status(400).json({
        success: false,
        message: "Payment fields cannot be changed through the order endpoint",
      });
    }

    if (req.user.role === "customer") {
      if (job.paymentMethod || job.razorpayOrderId || job.upiReference) {
        return res.status(400).json({ success: false, message: "Payment has started; print options cannot be changed" });
      }
      const calculated = await calculatePrice(job.pages, {
        copies: req.body.copies,
        printType: req.body.printType,
        side: req.body.side,
        paperSize: req.body.paperSize,
      });
      Object.assign(job, calculated, { colorMode: calculated.printType });
    } else if (req.user.role === "staff") {
      const disallowed = Object.keys(req.body).filter((field) => field !== "status");
      if (disallowed.length) {
        return res.status(403).json({
          success: false,
          message: "Staff can only update the order status",
        });
      }
      if (req.body.status !== undefined) {
        if (!canTransition(job.status, req.body.status) ||
            req.body.status === "Cancelled") {
          return res.status(400).json({
            success: false,
            message: `Staff cannot change status from ${job.status} to ${req.body.status}`,
          });
        }
        if (req.body.status === "Completed" && job.paymentStatus !== "Paid") {
          return res.status(400).json({ success: false, message: "An unpaid order cannot be completed" });
        }
        job.status = req.body.status;
      }
    } else {
      if (req.body.status !== undefined) {
        if (!canTransition(job.status, req.body.status)) {
          return res.status(400).json({
            success: false,
            message: `Cannot change status from ${job.status} to ${req.body.status}`,
          });
        }
        if (req.body.status === "Completed" && job.paymentStatus !== "Paid") {
          return res.status(400).json({ success: false, message: "An unpaid order cannot be completed" });
        }
        job.status = req.body.status;
      }
      if (req.body.assignedStaff !== undefined) {
        if (req.body.assignedStaff) {
          if (!mongoose.isValidObjectId(req.body.assignedStaff)) {
            return res.status(400).json({ success: false, message: "Invalid staff ID" });
          }
          const staff = await User.findOne({
            _id: req.body.assignedStaff,
            role: "staff",
            shopId: job.shopId,
          });
          if (!staff) {
            return res.status(400).json({ success: false, message: "Staff must belong to this order's shop" });
          }
        }
        job.assignedStaff = req.body.assignedStaff || null;
      }
      if (req.user.role === "admin") {
        const optionFieldsPresent = ["copies", "printType", "side", "paperSize"]
          .some((field) => req.body[field] !== undefined);
        if (optionFieldsPresent) {
          const calculated = await calculatePrice(job.pages, {
            copies: req.body.copies ?? job.copies,
            printType: req.body.printType ?? job.printType,
            side: req.body.side ?? job.side,
            paperSize: req.body.paperSize ?? job.paperSize,
          });
          Object.assign(job, calculated, { colorMode: calculated.printType });
        }
      }
      if (req.body.assignedPrinter !== undefined || req.body.printerName !== undefined) {
        job.printerName = String(req.body.assignedPrinter ?? req.body.printerName).trim();
      }
      if (req.body.notes !== undefined) {
        job.notes = String(req.body.notes).trim().slice(0, 1000);
      }
    }

    await job.save();
    const updated = await populateJob(PrintJob.findById(job._id));
    return res.json({ success: true, message: "Order updated", job: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Unable to update order" });
  }
});

router.delete("/:id", protect, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access only" });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }
  const job = await PrintJob.findById(req.params.id);
  if (!job) return res.status(404).json({ success: false, message: "Order not found" });
  await job.deleteOne();
  return res.json({ success: true, message: "Order deleted" });
});

module.exports = router;
