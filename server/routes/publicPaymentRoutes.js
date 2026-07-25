const crypto = require("crypto");
const express = require("express");

const PrintJob = require("../models/printJob");
const Shop = require("../models/Shop");
const { paymentLimiter, upiLimiter } = require("../middleware/rateLimits");
const { calculatePrice } = require("../utils/pricing");
const paymentService = require("../services/shopPaymentService");
const paymentWorkflow = require("../services/paymentWorkflowService");

const router = express.Router();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const publicOptions = (job) => ({
  copies: job.copies,
  printType: job.printType,
  side: job.side,
  paperSize: job.paperSize,
});

const sendError = (res, error, fallback) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This payment reference is already linked to another order",
    });
  }
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return res.status(status).json({
    success: false,
    message: status < 500 && error?.message ? error.message : fallback,
  });
};

const logUnexpectedPaymentError = (label, error) => {
  if (Number.isInteger(error?.status) && error.status < 500) return;
  console.error(label, { message: error?.message || "Unknown payment error" });
};

const loadPublicOrder = async (body, includeRazorpayAmount = false) => {
  const orderToken = typeof body?.orderToken === "string" ? body.orderToken.trim() : "";
  const shopCode = typeof body?.shopCode === "string"
    ? body.shopCode.trim().toUpperCase()
    : "";

  if (!/^[a-f0-9]{64}$/i.test(orderToken) || !/^[A-Z0-9-]{3,50}$/.test(shopCode)) {
    throw paymentWorkflow.workflowError(
      "A valid order token and shop code are required",
      400,
      "INVALID_PUBLIC_ORDER"
    );
  }

  const shopSummary = await Shop.findOne({ shopCode, isActive: true }).select("_id");
  if (!shopSummary) {
    throw paymentWorkflow.workflowError("Shop not found or currently unavailable", 404);
  }

  const query = PrintJob.findOne({
    shopId: shopSummary._id,
    isGuestOrder: true,
    publicOrderTokenHash: hashToken(orderToken),
    publicOrderExpiresAt: { $gt: new Date() },
  }).select("+publicOrderTokenHash +publicOrderExpiresAt");
  if (includeRazorpayAmount) query.select("+razorpayAmount");
  const job = await query;
  if (!job) {
    throw paymentWorkflow.workflowError("Public order not found or link expired", 404);
  }

  const shop = await paymentService.findShopWithPaymentSecrets(shopSummary._id);
  if (!shop || shop.isActive === false || shop.shopCode !== shopCode) {
    throw paymentWorkflow.workflowError("Public order not found or link expired", 404);
  }
  return { job, shop };
};

const assertOnlinePaymentAvailable = (shop, method) => {
  if (shop.paymentEnabled === false) {
    throw paymentWorkflow.workflowError("Payments are currently disabled for this shop", 409);
  }
  if (!paymentService.modeIncludes(shop.paymentMode || "both", method)) {
    throw paymentWorkflow.workflowError(
      method === "razorpay"
        ? "This shop does not accept Razorpay payments"
        : "This shop does not accept UPI payments",
      409
    );
  }
  if (method === "upi" && !shop.upiId) {
    throw paymentWorkflow.workflowError("UPI is not configured for this shop", 503);
  }
};

const publicOrderResponse = (job) => ({
  id: job._id,
  paymentMethod: job.paymentMethod,
  paymentStatus: job.paymentStatus,
  status: job.status,
  invoiceNumber: job.paymentStatus === "Paid" ? job.invoiceNumber || "" : "",
});

router.post("/create-order", paymentLimiter, async (req, res) => {
  try {
    const { job, shop } = await loadPublicOrder(req.body, true);
    assertOnlinePaymentAvailable(shop, "razorpay");
    paymentWorkflow.assertPaymentCanStart(job, "Razorpay");

    const calculated = await calculatePrice(job.pages, publicOptions(job), job.shopId);
    const result = await paymentWorkflow.createRazorpayOrder({
      job,
      shop,
      calculated,
      paymentService,
    });

    return res.status(result.existing ? 200 : 201).json({
      success: true,
      keyId: result.keyId,
      order: result.order,
      quote: result.quote,
      ...(result.existing ? { message: "Existing Razorpay order returned" } : {}),
    });
  } catch (error) {
    logUnexpectedPaymentError("Public Razorpay order error:", error);
    return sendError(res, error, "Unable to create payment order");
  }
});

router.post("/verify", paymentLimiter, async (req, res) => {
  try {
    const orderId = typeof req.body?.razorpay_order_id === "string"
      ? req.body.razorpay_order_id.trim()
      : "";
    const paymentId = typeof req.body?.razorpay_payment_id === "string"
      ? req.body.razorpay_payment_id.trim()
      : "";
    const signature = typeof req.body?.razorpay_signature === "string"
      ? req.body.razorpay_signature.trim()
      : "";
    if ([orderId, paymentId, signature].some((value) => !value || value.length > 255)) {
      throw paymentWorkflow.workflowError(
        "Payment verification details are incomplete or invalid",
        400,
        "INVALID_PAYMENT_DETAILS"
      );
    }

    const { job, shop } = await loadPublicOrder(req.body, true);
    if (job.paymentStatus === "Refunded") {
      throw paymentWorkflow.workflowError("This payment was already refunded", 409);
    }
    if (job.paymentMethod !== "Razorpay" || job.razorpayOrderId !== orderId) {
      throw paymentWorkflow.workflowError(
        "Razorpay order does not match this print order",
        400,
        "ORDER_MISMATCH"
      );
    }

    const quotedAmount = paymentWorkflow.centsFor(job.price);
    const storedAmount = Number(job.razorpayAmount) || quotedAmount;
    if (storedAmount !== quotedAmount) {
      throw paymentWorkflow.workflowError(
        "Stored Razorpay amount does not match the server quote",
        409,
        "AMOUNT_MISMATCH"
      );
    }

    const { keySecret } = paymentService.resolveRazorpayCredentials(shop);
    if (!paymentWorkflow.verifyRazorpaySignature({
      orderId,
      paymentId,
      signature,
      keySecret,
    })) {
      throw paymentWorkflow.workflowError(
        "Payment signature verification failed",
        400,
        "INVALID_SIGNATURE"
      );
    }

    if (job.paymentStatus === "Paid") {
      if (job.razorpayPaymentId !== paymentId) {
        throw paymentWorkflow.workflowError("This order is already paid", 409);
      }
      return res.json({
        success: true,
        message: "Payment was already verified",
        order: publicOrderResponse(job),
      });
    }

    const result = await paymentWorkflow.finalizeRazorpayPayment({
      job,
      paymentId,
      signature,
      verifiedBy: null,
      note: job.status === "Cancelled"
        ? "Guest Razorpay payment verified for a cancelled order; manual refund review required"
        : "Guest Razorpay signature verified by server",
    });
    return res.json({
      success: true,
      message: "Payment verified successfully",
      order: publicOrderResponse(result.job),
    });
  } catch (error) {
    logUnexpectedPaymentError("Public payment verification error:", error);
    return sendError(res, error, "Unable to verify payment");
  }
});

router.post("/upi", upiLimiter, async (req, res) => {
  try {
    const upiReference = typeof req.body?.upiReference === "string"
      ? req.body.upiReference.trim().toUpperCase()
      : "";
    if (upiReference.length < 6 || upiReference.length > 100 || !/^[A-Z0-9._-]+$/.test(upiReference)) {
      throw paymentWorkflow.workflowError("Enter a valid UPI transaction number", 400);
    }

    const { job, shop } = await loadPublicOrder(req.body);
    assertOnlinePaymentAvailable(shop, "upi");
    paymentWorkflow.assertPaymentCanStart(job, "UPI");

    if (job.paymentMethod === "UPI" && job.upiReference) {
      if (job.paymentStatus === "Rejected") {
        throw paymentWorkflow.workflowError(
          "This UPI reference was rejected. Contact the shop before retrying payment.",
          409
        );
      }
      if (job.upiReference.toUpperCase() !== upiReference) {
        throw paymentWorkflow.workflowError(
          "A different UPI reference is already submitted for this order",
          409
        );
      }
      return res.json({
        success: true,
        message: "UPI payment was already submitted. Waiting for shop verification.",
        order: publicOrderResponse(job),
      });
    }

    const escapedReference = upiReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await PrintJob.exists({
      _id: { $ne: job._id },
      upiReference: { $regex: `^${escapedReference}$`, $options: "i" },
    });
    if (duplicate) {
      throw paymentWorkflow.workflowError("This UPI transaction number is already in use", 409);
    }

    const updated = await PrintJob.findOneAndUpdate(
      {
        _id: job._id,
        paymentStatus: { $nin: ["Paid", "Refunded"] },
        paymentMethod: { $in: ["", null, "UPI"] },
        upiReference: { $in: ["", null, upiReference] },
      },
      {
        $set: {
          paymentMethod: "UPI",
          paymentStatus: "Pending",
          upiReference,
          paymentVerifiedAt: null,
          paymentVerifiedBy: null,
          paymentNotes: "Guest UPI reference submitted; awaiting shop verification",
        },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      throw paymentWorkflow.workflowError("The payment changed in another request", 409);
    }
    paymentWorkflow.emitPaymentUpdate(updated);

    return res.json({
      success: true,
      message: "UPI payment submitted. Waiting for shop verification.",
      order: publicOrderResponse(updated),
    });
  } catch (error) {
    logUnexpectedPaymentError("Public UPI payment error:", error);
    return sendError(res, error, "Unable to submit UPI payment");
  }
});

router.post("/cash", async (req, res) => {
  try {
    const { job, shop } = await loadPublicOrder(req.body);
    if (shop.paymentEnabled === false) {
      throw paymentWorkflow.workflowError(
        "Payments are currently disabled for this shop",
        409
      );
    }
    paymentWorkflow.assertPaymentCanStart(job, "Cash");

    if (job.paymentMethod === "Cash") {
      if (job.paymentStatus === "Rejected") {
        throw paymentWorkflow.workflowError(
          "This cash payment selection was rejected. Contact the shop before retrying.",
          409
        );
      }
      return res.json({
        success: true,
        message: "Cash payment was already selected.",
        order: publicOrderResponse(job),
      });
    }

    const updated = await PrintJob.findOneAndUpdate(
      {
        _id: job._id,
        paymentStatus: { $nin: ["Paid", "Refunded"] },
        paymentMethod: { $in: ["", null] },
      },
      {
        $set: {
          paymentMethod: "Cash",
          paymentStatus: "Pending",
          paymentVerifiedAt: null,
          paymentVerifiedBy: null,
          paymentNotes: "Customer selected Pay at Shop",
        },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      throw paymentWorkflow.workflowError("The payment method changed in another request", 409);
    }
    paymentWorkflow.emitPaymentUpdate(updated);

    return res.json({
      success: true,
      message: "Cash payment selected successfully.",
      order: publicOrderResponse(updated),
    });
  } catch (error) {
    logUnexpectedPaymentError("Public Cash payment error:", error);
    return sendError(res, error, "Unable to create cash payment");
  }
});

module.exports = router;
