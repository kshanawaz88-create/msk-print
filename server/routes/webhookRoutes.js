const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const PrintJob = require("../models/printJob");
const { createInvoiceNumber } = require("../utils/invoice");
const paymentService = require("../services/shopPaymentService");

const router = express.Router();

router.post("/:shopId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.shopId)) {
      return res.status(400).json({ success: false, message: "Invalid shop webhook identifier" });
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid webhook request body" });
    }

    const signature = req.get("x-razorpay-signature") || "";
    if (!signature) {
      return res.status(400).json({ success: false, message: "Webhook signature is required" });
    }

    const shop = await paymentService.findShopWithPaymentSecrets(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }
    const secret = paymentService.resolveWebhookSecret(shop);
    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    const valid = expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature" });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ success: false, message: "Webhook body must be valid JSON" });
    }
    if (event.event !== "payment.captured") {
      return res.json({ success: true, message: "Event ignored" });
    }

    const payment = event.payload?.payment?.entity;
    if (
      !payment?.id ||
      !payment?.order_id ||
      payment.status !== "captured" ||
      !Number.isSafeInteger(payment.amount) ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        success: false,
        message: "Captured payment details are incomplete",
      });
    }

    const job = await PrintJob.findOne({
      shopId: shop._id,
      razorpayOrderId: payment.order_id,
      paymentMethod: "Razorpay",
    }).select("+razorpayAmount");
    if (!job) {
      return res.json({ success: true, message: "No matching print order for this shop" });
    }

    const quotedAmount = Number(job.razorpayAmount) ||
      Math.round(Number(job.price) * 100);
    if (!Number.isSafeInteger(quotedAmount) || payment.amount !== quotedAmount) {
      return res.status(409).json({
        success: false,
        message: "Captured amount does not match the print order",
      });
    }
    if (job.paymentStatus === "Paid") {
      return res.json({
        success: true,
        message: job.razorpayPaymentId === payment.id
          ? "Payment already reconciled"
          : "Print order already paid by another payment",
      });
    }
    if (job.paymentStatus === "Refunded") {
      return res.json({ success: true, message: "Refunded print order was not changed" });
    }

    const paymentUsedElsewhere = await PrintJob.exists({
      _id: { $ne: job._id },
      razorpayPaymentId: payment.id,
      paymentStatus: "Paid",
    });
    if (paymentUsedElsewhere) {
      return res.status(409).json({
        success: false,
        message: "Payment is already linked to another print order",
      });
    }

    const updated = await PrintJob.findOneAndUpdate(
      {
        _id: job._id,
        shopId: shop._id,
        razorpayOrderId: payment.order_id,
        paymentMethod: "Razorpay",
        paymentStatus: { $in: ["Pending", "Failed"] },
      },
      {
        $set: {
          paymentStatus: "Paid",
          status: "Pending",
          razorpayPaymentId: payment.id,
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: null,
          invoiceNumber: job.invoiceNumber || createInvoiceNumber(job._id),
          paymentNotes: "Razorpay captured payment reconciled by verified shop webhook",
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    return res.json({
      success: true,
      message: updated ? "Payment reconciled" : "Payment already finalized",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
