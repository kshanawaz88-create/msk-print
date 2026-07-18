const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const PrintJob = require("../models/PrintJob");
const { protect } = require("../middleware/auth");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ==========================================
// Create Razorpay Order
// ==========================================
router.post("/create-order", protect, async (req, res) => {
  try {
    const { amount, printJobId } = req.body;

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid payment amount is required",
      });
    }

    if (!printJobId) {
      return res.status(400).json({
        success: false,
        message: "Print job ID is required",
      });
    }

    const printJob = await PrintJob.findById(printJobId);

    if (!printJob) {
      return res.status(404).json({
        success: false,
        message: "Print order not found",
      });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner =
      printJob.user &&
      printJob.user.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "You cannot pay for this print order",
      });
    }

    // Razorpay receipt must be no longer than 40 characters.
    const receiptId = `ORD${Date.now()}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(numericAmount * 100),
      currency: "INR",
      receipt: receiptId,
      notes: {
        printJobId: printJob._id.toString(),
        userId: req.user.id,
      },
    });

    printJob.price = numericAmount;
    printJob.paymentStatus = "Pending";

    if ("razorpayOrderId" in printJob) {
      printJob.razorpayOrderId = razorpayOrder.id;
    }

    await printJob.save();

    return res.status(201).json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order: razorpayOrder,
    });
  } catch (error) {
    console.log("Create Razorpay order error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        error?.message ||
        "Unable to create Razorpay order",
    });
  }
});

// ==========================================
// Verify Razorpay Payment
// ==========================================
router.post("/verify", protect, async (req, res) => {
  try {
    const {
      printJobId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      copies,
      printType,
      side,
      price,
    } = req.body;

    if (
      !printJobId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are incomplete",
      });
    }

    const printJob = await PrintJob.findById(printJobId);

    if (!printJob) {
      return res.status(404).json({
        success: false,
        message: "Print order not found",
      });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner =
      printJob.user &&
      printJob.user.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "You cannot verify this print order",
      });
    }

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    const expectedBuffer = Buffer.from(
      expectedSignature,
      "utf8"
    );

    const receivedBuffer = Buffer.from(
      razorpay_signature,
      "utf8"
    );

    const signatureIsValid =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      );

    if (!signatureIsValid) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed",
      });
    }

    printJob.copies = Math.max(Number(copies) || 1, 1);
    printJob.printType =
      printType || printJob.printType;
    printJob.side = side || printJob.side;
    printJob.price =
      Number(price) || printJob.price;
    printJob.paymentStatus = "Paid";
    printJob.status = "Pending";

    printJob.notes =
      `Razorpay payment verified. ` +
      `Order ID: ${razorpay_order_id}. ` +
      `Payment ID: ${razorpay_payment_id}.`;

    if ("razorpayOrderId" in printJob) {
      printJob.razorpayOrderId =
        razorpay_order_id;
    }

    if ("razorpayPaymentId" in printJob) {
      printJob.razorpayPaymentId =
        razorpay_payment_id;
    }

    await printJob.save();

    return res.json({
      success: true,
      message: "Payment verified successfully",
      printJob,
    });
  } catch (error) {
    console.log("Payment verification error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Unable to verify payment",
    });
  }
});

module.exports = router;