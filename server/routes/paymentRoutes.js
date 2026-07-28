const express = require("express");
const mongoose = require("mongoose");

const PrintJob = require("../models/printJob");
const { protect } = require("../middleware/auth");
const { calculatePrice } = require("../utils/pricing");
const { paymentLimiter, upiLimiter } = require("../middleware/rateLimits");
const paymentService = require("../services/shopPaymentService");
const paymentWorkflow = require("../services/paymentWorkflowService");

const {
  validatePaymentOptions,
  validateRazorpayVerification,
  validateUpi,
  validateUpiDecision,
} = require("../middleware/validate");

const router = express.Router();

const validId = (id) =>
  mongoose.isValidObjectId(id);

const ownsJob = (job, user) =>
  job.user?.toString() === user.id;

const paymentOptions = (body) => ({
  copies: body.copies,
  printType: body.printType,
  side: body.side,
  paperSize: body.paperSize,
});

const getJob = async (
  id,
  includePaymentAmount = false
) => {
  if (!validId(id)) {
    return null;
  }

  const query = PrintJob.findById(id);

  return includePaymentAmount
    ? query.select("+razorpayAmount")
    : query;
};

const statusForError = (
  error,
  fallback = 400
) =>
  Number.isInteger(error.status)
    ? error.status
    : fallback;

const logUnexpectedPaymentError = (label, error, context = {}) => {
  if (Number.isInteger(error?.status) && error.status < 500) return;
  console.error(label, { ...context, message: error?.message || "Unknown payment error" });
};

const safePaymentError = (
  res,
  error,
  fallbackMessage,
  fallbackStatus = 400
) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This payment reference is already linked to another order",
    });
  }
  const hasSafeStatus = Number.isInteger(error?.status);
  const status = statusForError(error, fallbackStatus);
  return res
    .status(status)
    .json({
      success: false,
      message:
        hasSafeStatus && status < 500
          ? error.message
          : fallbackMessage,
    });
};

const assertPaymentMethodAvailable = (
  shop,
  method
) => {
  if (!shop) {
    const error = new Error(
      "The order's shop no longer exists"
    );

    error.status = 404;
    throw error;
  }

  if (
    shop.paymentEnabled === false ||
    shop.isActive === false
  ) {
    const error = new Error(
      "Payments are currently disabled for this shop"
    );

    error.status = 409;
    throw error;
  }

  if (
    !paymentService.modeIncludes(
      shop.paymentMode || "both",
      method
    )
  ) {
    const error = new Error(
      method === "razorpay"
        ? "This shop does not accept Razorpay payments"
        : "This shop does not accept UPI payments"
    );

    error.status = 409;
    throw error;
  }

  if (
    method === "upi" &&
    !shop.upiId
  ) {
    const error = new Error(
      "UPI is not configured for this shop"
    );

    error.status = 503;
    throw error;
  }
};

router.get(
  "/config/:printJobId",
  protect,
  async (req, res, next) => {
    try {
      const job = await getJob(
        req.params.printJobId
      );

      if (!job) {
        return res
          .status(
            validId(
              req.params.printJobId
            )
              ? 404
              : 400
          )
          .json({
            success: false,

            message: validId(
              req.params.printJobId
            )
              ? "Print order not found"
              : "Invalid print job ID",
          });
      }

      if (
        !ownsJob(
          job,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot access payment configuration for this order",
          });
      }

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      if (!shop) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "The order's shop no longer exists",
          });
      }

      return res.json({
        success: true,

        shop: {
          id: shop._id,
          shopName:
            shop.shopName,
        },

        payment:
          paymentService
            .buildPublicPaymentConfiguration(
              shop
            ),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/quote",
  protect,
  validatePaymentOptions,
  async (req, res) => {
    try {
      const job = await getJob(
        req.body.printJobId
      );

      if (!job) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Print order not found",
          });
      }

      if (
        !ownsJob(
          job,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot price this order",
          });
      }

      if (
        job.paymentStatus ===
        "Paid"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This order is already paid",
          });
      }

      const quote =
        await calculatePrice(
          job.pages,
          paymentOptions(
            req.body
          ),
          job.shopId
        );

      return res.json({
        success: true,
        price: quote.price,

        breakdown: {
          ...quote.breakdown,

          currency:
            job.currency ||
            "INR",
        },
      });
    } catch (error) {
      logUnexpectedPaymentError("Price quote error:", error, {
        printJobId: req.body?.printJobId,
      });

      const clientError = [
        "Copies must",
        "Invalid print type",
        "Invalid printing side",
        "Invalid paper size",
        "This file does not have a valid page count",
        "Shop pricing is not configured correctly",
        "Shop GST setting is invalid",
      ].some((message) =>
        error.message?.startsWith(
          message
        )
      );

      return res
        .status(
          clientError
            ? 400
            : 500
        )
        .json({
          success: false,

          message:
            clientError
              ? error.message
              : "Unable to calculate price",
        });
    }
  }
);
router.post(
  "/create-order",
  paymentLimiter,
  protect,
  validatePaymentOptions,
  async (req, res) => {
    try {
      const job = await getJob(
        req.body.printJobId,
        true
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message: "Print order not found",
        });
      }

      if (!ownsJob(job, req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot pay for this order",
        });
      }

      paymentWorkflow.assertPaymentCanStart(job, "Razorpay");

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      assertPaymentMethodAvailable(
        shop,
        "razorpay"
      );

      const calculated =
        await calculatePrice(
          job.pages,
          paymentOptions(req.body),
          job.shopId
        );
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
        ...(result.existing
          ? { message: "Existing Razorpay order returned" }
          : {}),
      });
    } catch (error) {
      logUnexpectedPaymentError("Razorpay order error:", error, {
        printJobId: req.body?.printJobId,
      });

      return safePaymentError(
        res,
        error,
        "Unable to create payment order",
        502
      );
    }
  }
);

router.post(
  "/verify",
  paymentLimiter,
  protect,
  validateRazorpayVerification,
  async (req, res) => {
    try {
      const {
        printJobId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;

      const job = await getJob(
        printJobId,
        true
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message:
            "Print order not found",
        });
      }

      if (!ownsJob(job, req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot verify this order",
        });
      }

      if (
        job.paymentStatus ===
        "Refunded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment was already refunded",
        });
      }

      if (
        job.razorpayOrderId !==
          razorpay_order_id ||
        job.paymentMethod !==
          "Razorpay"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Razorpay order does not match this print order",
        });
      }

      const quotedAmount =
        Math.round(
          Number(job.price) * 100
        );

      const storedOrderAmount =
        Number(job.razorpayAmount) ||
        quotedAmount;

      if (
        !Number.isSafeInteger(
          quotedAmount
        ) ||
        quotedAmount < 100 ||
        storedOrderAmount !==
          quotedAmount
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Stored Razorpay amount does not match the server quote",
        });
      }

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      const { keySecret } =
        paymentService
          .resolveRazorpayCredentials(
            shop
          );

      const valid = paymentWorkflow.verifyRazorpaySignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        keySecret,
      });

      if (!valid) {
        return res.status(400).json({
          success: false,
          message:
            "Payment signature verification failed",
        });
      }

      if (job.paymentStatus === "Paid") {
        if (job.razorpayPaymentId !== razorpay_payment_id) {
          return res.status(409).json({
            success: false,
            message: "This order is already paid",
          });
        }
        return res.json({
          success: true,
          message: "Payment was already verified",
          job,
        });
      }

      const result = await paymentWorkflow.finalizeRazorpayPayment({
        job,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        verifiedBy: req.user.id,
        note: job.status === "Cancelled"
          ? "Razorpay signature verified for a cancelled order; manual refund review required"
          : "Razorpay signature verified by server",
      });

      return res.json({
        success: true,
        message:
          "Payment verified successfully",
        job: result.job,
      });
    } catch (error) {
      logUnexpectedPaymentError("Payment verification error:", error, {
        printJobId: req.body?.printJobId,
      });

      return safePaymentError(
        res,
        error,
        "Unable to verify payment",
        500
      );
    }
  }
);
router.post(
  "/upi",
  upiLimiter,
  protect,
  validateUpi,
  async (req, res) => {
    try {
      const reference =
        req.body.upiReference
          .trim()
          .toUpperCase();

      const escapedReference =
        reference.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const job = await getJob(
        req.body.printJobId
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message:
            "Print order not found",
        });
      }

      if (!ownsJob(job, req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot update this order",
        });
      }

      paymentWorkflow.assertPaymentCanStart(job, "UPI");

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      assertPaymentMethodAvailable(
        shop,
        "upi"
      );

      if (job.paymentMethod === "UPI" && job.upiReference) {
        if (job.paymentStatus === "Rejected") {
          return res.status(409).json({
            success: false,
            message: "This UPI reference was rejected. Contact the shop before retrying payment.",
          });
        }
        if (job.upiReference.toUpperCase() !== reference) {
          return res.status(409).json({
            success: false,
            message: "A different UPI reference is already submitted for this order",
          });
        }
        const existingQuote = await calculatePrice(
          job.pages,
          paymentOptions(req.body),
          job.shopId
        );
        if (!paymentWorkflow.quoteMatchesJob(job, existingQuote)) {
          return res.status(409).json({
            success: false,
            message: "Print options cannot change after a UPI reference is submitted",
          });
        }
        return res.json({
          success: true,
          message: "UPI reference was already submitted for shop verification",
          job,
        });
      }

      const reusedReference =
        await PrintJob.exists({
          _id: {
            $ne: job._id,
          },

          upiReference: {
            $regex:
              `^${escapedReference}$`,

            $options: "i",
          },

        });

      if (reusedReference) {
        return res.status(409).json({
          success: false,
          message:
            "This UPI reference is already in use",
        });
      }

      const calculated =
        await calculatePrice(
          job.pages,
          paymentOptions(req.body),
          job.shopId
        );

      const updated = await PrintJob.findOneAndUpdate(
        {
          _id: job._id,
          paymentStatus: { $nin: ["Paid", "Refunded"] },
          paymentMethod: { $in: ["", null, "UPI"] },
          upiReference: { $in: ["", null, reference] },
        },
        {
          $set: {
            ...paymentWorkflow.quoteFields(calculated),
            paymentMethod: "UPI",
            paymentStatus: "Pending",
            upiReference: reference,
            paymentVerifiedAt: null,
            paymentVerifiedBy: null,
            paymentNotes: "UPI reference submitted; awaiting shop verification",
          },
        },
        { returnDocument: "after", runValidators: true }
      );

      if (!updated) {
        throw paymentWorkflow.workflowError(
          "The payment method or UPI reference changed in another request",
          409,
          "PAYMENT_CONFLICT"
        );
      }

      paymentWorkflow.emitPaymentUpdate(updated);

      return res.json({
        success: true,

        message:
          "UPI reference submitted for shop verification",

        job: updated,
      });
    } catch (error) {
      return safePaymentError(
        res,
        error,
        "Unable to submit UPI reference"
      );
    }
  }
);

router.patch(
  "/upi/:id/verify",
  protect,
  validateUpiDecision,
  async (req, res) => {
    try {
      if (
        ![
          "admin",
          "shopOwner",
        ].includes(req.user.role)
      ) {
        return res.status(403).json({
          success: false,

          message:
            "Only an admin or the order's shop owner can review UPI payments",
        });
      }

      const job = await getJob(
        req.params.id
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message:
            "Print order not found",
        });
      }

      if (
        req.user.role ===
          "shopOwner" &&
        req.user.shopId?.toString() !==
          job.shopId?.toString()
      ) {
        return res.status(403).json({
          success: false,

          message:
            "You cannot review another shop's payment",
        });
      }

      if (
        job.paymentMethod !== "UPI" ||
        !job.upiReference
      ) {
        return res.status(400).json({
          success: false,

          message:
            "This order has no submitted UPI payment",
        });
      }

      const result = await paymentWorkflow.decideManualPayment({
        job,
        method: "UPI",
        decision: req.body.decision,
        actorId: req.user.id,
        notes: req.body.notes,
      });

      return res.json({
        success: true,

        message:
          req.body.decision ===
          "approve"
            ? "UPI payment approved"
            : "UPI payment rejected",

        job: result.job,
      });
    } catch (error) {
      return safePaymentError(
        res,
        error,
        "Unable to review UPI payment"
      );
    }
  }
);
router.post(
  "/cash",
  protect,
  validatePaymentOptions,
  async (req, res) => {
    try {
      const job = await getJob(
        req.body.printJobId
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message: "Print order not found",
        });
      }

      if (!ownsJob(job, req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot update this order",
        });
      }

      paymentWorkflow.assertPaymentCanStart(job, "Cash");

      const shop = await paymentService.findShopWithPaymentSecrets(job.shopId);
      if (!shop || shop.isActive === false) {
        return res.status(404).json({
          success: false,
          message: "The order's shop is unavailable",
        });
      }
      if (shop.paymentEnabled === false) {
        return res.status(409).json({
          success: false,
          message: "Payments are currently disabled for this shop",
        });
      }

      const calculated =
        await calculatePrice(
          job.pages,
          paymentOptions(req.body),
          job.shopId
        );

      if (job.paymentMethod === "Cash") {
        if (job.paymentStatus === "Rejected") {
          return res.status(409).json({
            success: false,
            message: "This cash payment selection was rejected. Contact the shop before retrying.",
          });
        }
        if (!paymentWorkflow.quoteMatchesJob(job, calculated)) {
          return res.status(409).json({
            success: false,
            message: "Print options cannot change after cash payment is selected",
          });
        }
        return res.json({
          success: true,
          message: "Cash payment was already selected. Pay at the shop counter.",
          job,
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
            ...paymentWorkflow.quoteFields(calculated),
            paymentMethod: "Cash",
            paymentStatus: "Pending",
            paymentVerifiedAt: null,
            paymentVerifiedBy: null,
            paymentNotes: "Customer selected pay at shop",
          },
        },
        { returnDocument: "after", runValidators: true }
      );
      if (!updated) {
        throw paymentWorkflow.workflowError(
          "The payment method changed in another request",
          409,
          "PAYMENT_CONFLICT"
        );
      }

      paymentWorkflow.emitPaymentUpdate(updated);

      return res.json({
        success: true,
        message:
          "Cash payment selected. Pay at the shop counter.",
        job: updated,
      });
    } catch (error) {
      return safePaymentError(
        res,
        error,
        "Unable to create cash payment order"
      );
    }
  }
);
router.patch(
  "/cash/:id/verify",
  protect,
  async (req, res) => {
    try {
      const decision = req.body?.decision || "approve";
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
      if (!validId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid print job ID" });
      }
      if (!["approve", "reject"].includes(decision)) {
        return res.status(400).json({ success: false, message: "Decision must be approve or reject" });
      }
      if (notes.length > 500) {
        return res.status(400).json({ success: false, message: "Notes cannot exceed 500 characters" });
      }

      if (
        ![
          "admin",
          "shopOwner",
          "staff",
        ].includes(req.user.role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only shop staff can confirm cash payment",
        });
      }

      const job = await getJob(
        req.params.id
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message:
            "Print order not found",
        });
      }

      if (
        ["shopOwner", "staff"].includes(
          req.user.role
        ) &&
        req.user.shopId?.toString() !==
          job.shopId?.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot confirm payment for another shop",
        });
      }

      if (
        job.paymentMethod !== "Cash"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This order is not a cash payment",
        });
      }

      const result = await paymentWorkflow.decideManualPayment({
        job,
        method: "Cash",
        decision,
        actorId: req.user.id,
        notes: notes || (decision === "approve" ? "Cash received at shop" : "Cash payment rejected"),
      });

      return res.json({
        success: true,
        message:
          decision === "approve" ? "Cash payment confirmed" : "Cash payment rejected",
        job: result.job,
      });
    } catch (error) {
      return safePaymentError(
        res,
        error,
        "Unable to confirm cash payment"
      );
    }
  }
);

module.exports = router;
