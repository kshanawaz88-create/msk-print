const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const PrintJob = require("../models/printJob");
const { protect } = require("../middleware/auth");
const { calculatePrice } = require("../utils/pricing");
const { createInvoiceNumber } = require("../utils/invoice");
const { paymentLimiter, upiLimiter } = require("../middleware/rateLimits");
const paymentService = require("../services/shopPaymentService");

const {
  validatePaymentOptions,
  validateRazorpayVerification,
  validateUpi,
  validateUpiDecision,
} = require("../middleware/validate");

const { emitOrderUpdate } = require("../socket");

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

const safePaymentError = (
  res,
  error,
  fallbackMessage,
  fallbackStatus = 400
) =>
  res
    .status(
      statusForError(
        error,
        fallbackStatus
      )
    )
    .json({
      success: false,
      message:
        error.message ||
        fallbackMessage,
    });

const emitJobUpdate = (job) => {
  if (!job?._id) {
    return;
  }

  const safeOrder =
    typeof job.toObject === "function"
      ? job.toObject()
      : job;

  emitOrderUpdate({
    orderToken:
      job._id.toString(),

    shopId:
      job.shopId?.toString(),

    order: safeOrder,
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
          )
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
      console.error(
        "Price quote error:",
        {
          printJobId:
            req.body
              ?.printJobId,

          message:
            error.message,
        }
      );

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

      if (
        job.paymentStatus === "Paid" ||
        job.paymentStatus === "Refunded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment is already finalized",
        });
      }

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      assertPaymentMethodAvailable(
        shop,
        "razorpay"
      );

      const credentials =
        paymentService
          .resolveRazorpayCredentials(
            shop
          );

      const calculated =
        await calculatePrice(
          job.pages,
          paymentOptions(req.body)
        );

      const amount = Math.round(
        calculated.price * 100
      );

      if (
        !Number.isSafeInteger(amount) ||
        amount < 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The calculated payment amount is invalid",
        });
      }

      if (
        job.paymentMethod ===
          "Razorpay" &&
        job.razorpayOrderId &&
        ["Pending", "Failed"].includes(
          job.paymentStatus
        )
      ) {
        const existingAmount =
          Number(job.razorpayAmount) ||
          Math.round(
            Number(job.price) * 100
          );

        if (
          existingAmount !== amount
        ) {
          return res.status(409).json({
            success: false,
            message:
              "A Razorpay order already exists for different print options",
          });
        }

        return res.json({
          success: true,
          keyId: credentials.keyId,

          order: {
            id: job.razorpayOrderId,
            amount: existingAmount,
            currency:
              job.currency || "INR",
            receipt: `MSK-${job._id}`,
            status: "created",
          },

          quote: {
            ...calculated,
            currency: job.currency,
          },

          message:
            "Existing Razorpay order returned",
        });
      }

      const razorpayOrder =
        await paymentService
          .createRazorpayClient(
            credentials
          )
          .orders.create({
            amount,
            currency: "INR",
            receipt: `MSK-${job._id}`,

            notes: {
              shopId:
                shop._id.toString(),

              printJobId:
                job._id.toString(),
            },
          });

      Object.assign(
        job,
        calculated,
        {
          colorMode:
            calculated.printType,

          invoiceSubtotal:
            calculated.breakdown
              .subtotal,

          invoiceGstRate:
            calculated.breakdown
              .gstPercent,

          invoiceGstAmount:
            calculated.breakdown
              .gstAmount,

          paymentMethod:
            "Razorpay",

          paymentStatus:
            "Pending",

          razorpayOrderId:
            razorpayOrder.id,

          razorpayAmount:
            amount,

          razorpayPaymentId: "",
          razorpaySignature: "",
          upiReference: "",

          paymentVerifiedAt:
            null,

          paymentVerifiedBy:
            null,

          paymentNotes:
            "Awaiting Razorpay signature verification",
        }
      );

      await job.save();

      return res.status(201).json({
        success: true,
        keyId: credentials.keyId,

        order: {
          id: razorpayOrder.id,
          amount:
            razorpayOrder.amount,
          currency:
            razorpayOrder.currency,
          receipt:
            razorpayOrder.receipt,
          status:
            razorpayOrder.status,
        },

        quote: {
          ...calculated,
          currency: job.currency,
        },
      });
    } catch (error) {
      console.error(
        "Razorpay order error:",
        {
          printJobId:
            req.body?.printJobId,

          message:
            error.message,
        }
      );

      return safePaymentError(
        res,
        error,
        "Unable to create payment order"
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
        job.paymentStatus === "Paid"
      ) {
        if (
          job.razorpayPaymentId ===
          razorpay_payment_id
        ) {
          return res.json({
            success: true,
            message:
              "Payment was already verified",
            job,
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "This order is already paid",
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

      const duplicatePayment =
        await PrintJob.exists({
          _id: {
            $ne: job._id,
          },

          razorpayPaymentId:
            razorpay_payment_id,

          paymentStatus:
            "Paid",
        });

      if (duplicatePayment) {
        return res.status(409).json({
          success: false,
          message:
            "This Razorpay payment is already linked to another order",
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

      const expected = crypto
        .createHmac(
          "sha256",
          keySecret
        )
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest("hex");

      const valid =
        expected.length ===
          razorpay_signature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expected),
          Buffer.from(
            razorpay_signature
          )
        );

      if (!valid) {
        return res.status(400).json({
          success: false,
          message:
            "Payment signature verification failed",
        });
      }

      job.paymentStatus = "Paid";
      job.paymentMethod = "Razorpay";
      job.status = "Pending";

      job.razorpayPaymentId =
        razorpay_payment_id;

      job.razorpaySignature =
        razorpay_signature;

      job.paymentVerifiedAt =
        new Date();

      job.paymentVerifiedBy =
        req.user.id;

      job.invoiceNumber =
        job.invoiceNumber ||
        createInvoiceNumber(
          job._id
        );

      job.paymentNotes =
        "Razorpay signature verified by server";

      await job.save();

      emitJobUpdate(job);

      return res.json({
        success: true,
        message:
          "Payment verified successfully",
        job,
      });
    } catch (error) {
      console.error(
        "Payment verification error:",
        {
          printJobId:
            req.body?.printJobId,

          message:
            error.message,
        }
      );

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

      if (
        job.paymentStatus === "Paid" ||
        job.paymentStatus === "Refunded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment is already finalized",
        });
      }

      const shop =
        await paymentService
          .findShopWithPaymentSecrets(
            job.shopId
          );

      assertPaymentMethodAvailable(
        shop,
        "upi"
      );

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

          paymentStatus: {
            $in: [
              "Pending",
              "Paid",
            ],
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
          paymentOptions(req.body)
        );

      Object.assign(
        job,
        calculated,
        {
          colorMode:
            calculated.printType,

          invoiceSubtotal:
            calculated.breakdown
              .subtotal,

          invoiceGstRate:
            calculated.breakdown
              .gstPercent,

          invoiceGstAmount:
            calculated.breakdown
              .gstAmount,

          paymentMethod: "UPI",
          paymentStatus:
            "Pending",

          status: "Pending",

          upiReference:
            reference,

          razorpayOrderId: "",
          razorpayPaymentId: "",
          razorpaySignature: "",

          paymentVerifiedAt:
            null,

          paymentVerifiedBy:
            null,

          paymentNotes:
            "UPI reference submitted; awaiting shop verification",
        }
      );

      await job.save();

      emitJobUpdate(job);

      return res.json({
        success: true,

        message:
          "UPI reference submitted for shop verification",

        job,
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

      if (
        job.paymentStatus !==
        "Pending"
      ) {
        return res.status(409).json({
          success: false,

          message:
            "This UPI payment has already been reviewed",
        });
      }

      job.paymentVerifiedAt =
        new Date();

      job.paymentVerifiedBy =
        req.user.id;

      if (
        req.body.decision ===
        "approve"
      ) {
        job.paymentStatus =
          "Paid";

        job.status =
          "Pending";

        job.invoiceNumber =
          job.invoiceNumber ||
          createInvoiceNumber(
            job._id
          );

        job.paymentNotes =
          req.body.notes?.trim() ||
          "UPI payment approved";
      } else {
        job.paymentStatus =
          "Rejected";

        job.paymentNotes =
          req.body.notes?.trim() ||
          "UPI payment rejected";
      }

      await job.save();

      emitJobUpdate(job);

      return res.json({
        success: true,

        message:
          req.body.decision ===
          "approve"
            ? "UPI payment approved"
            : "UPI payment rejected",

        job,
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

      if (
        job.paymentStatus === "Paid" ||
        job.paymentStatus === "Refunded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment is already finalized",
        });
      }

      const calculated =
        await calculatePrice(
          job.pages,
          paymentOptions(req.body)
        );

      Object.assign(job, calculated, {
        colorMode:
          calculated.printType,

        invoiceSubtotal:
          calculated.breakdown.subtotal,

        invoiceGstRate:
          calculated.breakdown.gstPercent,

        invoiceGstAmount:
          calculated.breakdown.gstAmount,

        paymentMethod: "Cash",
        paymentStatus: "Pending",
        status: "Pending",

        upiReference: "",
        razorpayOrderId: "",
        razorpayPaymentId: "",
        razorpaySignature: "",

        paymentVerifiedAt: null,
        paymentVerifiedBy: null,

        paymentNotes:
          "Customer selected pay at shop",
      });

      await job.save();

      emitJobUpdate(job);

      return res.json({
        success: true,
        message:
          "Cash payment selected. Pay at the shop counter.",
        job,
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

      if (
        job.paymentStatus !== "Pending"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This cash payment has already been reviewed",
        });
      }

      job.paymentStatus = "Paid";
      job.status = "Pending";

      job.paymentVerifiedAt =
        new Date();

      job.paymentVerifiedBy =
        req.user.id;

      job.invoiceNumber =
        job.invoiceNumber ||
        createInvoiceNumber(job._id);

    job.paymentNotes =
  req.body?.notes?.trim() ||
  "Cash received at shop";

      await job.save();

      emitJobUpdate(job);

      return res.json({
        success: true,
        message:
          "Cash payment confirmed",
        job,
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