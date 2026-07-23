const express = require("express");
const mongoose = require("mongoose");

const PrintJob = require("../models/printJob");
const { protect } = require("../middleware/auth");
const { buildInvoiceData } = require("../utils/invoiceData");
const { streamInvoicePdf } = require("../utils/invoicePdf");

const router = express.Router();

const canViewInvoice = (job, user) => {
  if (user.role === "admin") return true;
  if (user.role === "shopOwner") {
    return job.shopId?._id?.toString() === user.shopId?.toString();
  }
  if (user.role === "staff") {
    return job.assignedStaff?._id?.toString() === user.id;
  }
  return job.user?._id?.toString() === user.id;
};

const loadInvoice = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid print order ID" });
    }

    const job = await PrintJob.findById(req.params.id)
      .populate(
        "shopId",
        "shopName branchName address phone email gstNumber logo currency"
      )
      .populate("user", "fullName email")
      .populate("assignedStaff", "_id");

    if (!job) {
      return res.status(404).json({ success: false, message: "Print order not found" });
    }
    if (!canViewInvoice(job, req.user)) {
      return res.status(403).json({ success: false, message: "You cannot view this invoice" });
    }
    if (job.paymentStatus !== "Paid") {
      return res.status(409).json({
        success: false,
        message: `Invoice is unavailable while payment is ${job.paymentStatus}`,
      });
    }

    req.invoice = await buildInvoiceData(job);
    next();
  } catch (error) {
    next(error);
  }
};

router.get("/:id/pdf", protect, loadInvoice, (req, res) => {
  const safeNumber = req.invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="MSK-Invoice-${safeNumber}.pdf"`,
    "Cache-Control": "private, no-store",
  });
  streamInvoicePdf(req.invoice, res);
});

router.get("/:id", protect, loadInvoice, (req, res) => {
  res.set("Cache-Control", "private, no-store");
  return res.json({ success: true, invoice: req.invoice });
});

module.exports = router;
