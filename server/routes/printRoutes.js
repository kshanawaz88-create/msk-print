const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const PrintJob = require("../models/PrintJob");
const { protect } = require("../middleware/auth");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Upload Print Job
router.post("/", protect, upload.single("file"), async (req, res) => {
  try {
    let pages = 0;

    if (req.file.mimetype === "application/pdf") {
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      pages = pdfData.numpages;
    }

    const printJob = await PrintJob.create({
      user: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      pages,
      status: "Pending",
    });

    res.json({
      success: true,
      message: "File uploaded successfully!",
      jobId: printJob._id,
      pages,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Upload failed",
    });
  }
});

// Get Orders
router.get("/", protect, async (req, res) => {
  try {
    const orders = await PrintJob.find().sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: "Unable to fetch orders",
    });
  }
});

// Get One Order
router.get("/:id", protect, async (req, res) => {
  try {
    const printJob = await PrintJob.findById(req.params.id);

    if (!printJob) {
      return res.status(404).json({
        message: "No order found",
      });
    }

    res.json(printJob);
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
});

// Update Order
router.put("/:id", protect, async (req, res) => {
  try {
    const updatedJob = await PrintJob.findByIdAndUpdate(
      req.params.id,
      {
        copies: req.body.copies,
        printType: req.body.printType,
        side: req.body.side,
        price: req.body.price,
        status: req.body.status,
      },
      {
        new: true,
      }
    );

    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({
      message: "Update failed",
    });
  }
});

module.exports = router;