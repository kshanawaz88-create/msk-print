const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const pdfParse = require("pdf-parse");
const axios = require("axios");

const PrintJob = require("../models/PrintJob");
const User = require("../models/User");
const Shop = require("../models/Shop");

const sendEmail = require("../utils/sendEmail");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ===========================================
// Cloudinary Storage
// ===========================================

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "msk-print",
    resource_type: "raw",
    allowed_formats: [
      "pdf",
      "doc",
      "docx",
      "png",
      "jpg",
      "jpeg",
    ],
  },
});

const upload = multer({ storage });

// ===========================================
// Upload Print Job
// ===========================================

router.post(
  "/",
  protect,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      let pages = 0;

      if (req.file.mimetype === "application/pdf") {
        const response = await axios.get(req.file.path, {
          responseType: "arraybuffer",
        });

        const pdf = await pdfParse(response.data);
        pages = pdf.numpages;
      }

      // Find first active shop
      const shop = await Shop.findOne({
        isActive: true,
      });

      if (!shop) {
        return res.status(400).json({
          success: false,
          message: "No active shop found",
        });
      }

      const printJob = await PrintJob.create({
        shopId: shop._id,
        user: req.user.id,

        fileName: req.file.originalname,
        filePath: req.file.path,
        fileUrl: req.file.path,

        pages,
        copies: 1,

        printType: "Black & White",
        side: "Single Side",
        paperSize: "A4",
        colorMode: "Black & White",

        price: 0,
        paymentStatus: "Pending",

        printerName: "Printer 1",
        estimatedTime: 0,

        status: "Pending",
      });

      const customer = await User.findById(req.user.id);

      if (customer) {
        await sendEmail(
          customer.email,
          "MSK Print Cloud - Print Order Received",
          `Hello ${customer.fullName},

Your print order has been received successfully.

Shop: ${shop.shopName}
File: ${printJob.fileName}
Pages: ${printJob.pages}
Status: ${printJob.status}

Thank you for choosing MSK Print Cloud.

Regards,
MSK Print Cloud Team`
        );
      }

      return res.json({
        success: true,
        message: "File uploaded successfully",
        jobId: printJob._id,
        pages,
      });

    } catch (error) {
      console.log(error);

      return res.status(500).json({
        success: false,
        message: "Upload failed",
      });
    }
  }
);
// ===========================================
// Get All Orders
// ===========================================

router.get("/", protect, async (req, res) => {
  try {
    let orders;

   if (req.user.role === "admin") {

  orders = await PrintJob.find()
    .populate("shopId", "shopName")
    .populate("user", "fullName email")
    .populate("assignedStaff", "fullName email")
    .sort({ createdAt: -1 });

} else if (req.user.role === "shopOwner") {

  orders = await PrintJob.find({
    shopId: req.user.shopId,
  })
    .populate("shopId", "shopName")
    .populate("user", "fullName email")
    .populate("assignedStaff", "fullName email")
    .sort({ createdAt: -1 });

} else if (req.user.role === "staff") {

  orders = await PrintJob.find({
    assignedStaff: req.user.id,
  })
    .populate("shopId", "shopName")
    .populate("user", "fullName email")
    .sort({ createdAt: -1 });

} else {

  orders = await PrintJob.find({
    user: req.user.id,
  })
    .populate("shopId", "shopName")
    .sort({ createdAt: -1 });

}

    res.json(orders);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch orders",
    });
  }
});

// ===========================================
// Get Single Order
// ===========================================

router.get("/:id", protect, async (req, res) => {
  try {
    const printJob = await PrintJob.findById(req.params.id)
      .populate("shopId", "shopName")
      .populate("user", "fullName email")
      .populate("assignedStaff", "fullName email");

    if (!printJob) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Customers can only view their own orders
    if (
      req.user.role !== "admin" &&
      printJob.user &&
      printJob.user._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json(printJob);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});
// ===========================================
// Update Order
// ===========================================

router.put("/:id", protect, async (req, res) => {
  try {
    const updatedJob = await PrintJob.findByIdAndUpdate(
      req.params.id,
      {
        copies: req.body.copies,
        printType: req.body.printType,
        side: req.body.side,
        paperSize: req.body.paperSize,
        colorMode: req.body.colorMode,
        price: req.body.price,
        paymentStatus: req.body.paymentStatus,
        printerName: req.body.printerName,
        estimatedTime: req.body.estimatedTime,
        assignedStaff: req.body.assignedStaff,
        notes: req.body.notes,
        status: req.body.status,
      },
      {
        new: true,
      }
    )
      .populate("shopId", "shopName")
      .populate("user", "fullName email");

    if (!updatedJob) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Send status update email
    if (updatedJob.user) {
      await sendEmail(
        updatedJob.user.email,
        "MSK Print Cloud - Order Updated",
        `Hello ${updatedJob.user.fullName},

Your print order has been updated.

Shop: ${updatedJob.shopId?.shopName || "MSK Print Cloud"}
File: ${updatedJob.fileName}
Status: ${updatedJob.status}

Thank you for choosing MSK Print Cloud.

Regards,
MSK Print Cloud Team`
      );
    }

    res.json(updatedJob);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Update failed",
    });
  }
});

// ===========================================
// Delete Order
// ===========================================

router.delete("/:id", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can delete orders",
      });
    }

    const order = await PrintJob.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    await order.deleteOne();

    res.json({
      success: true,
      message: "Order deleted successfully",
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
});

// ===========================================
// Export Router
// ===========================================

module.exports = router;