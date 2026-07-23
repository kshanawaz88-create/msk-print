const crypto = require("crypto");
const express = require("express");

const PrintJob = require("../models/printJob");
const Shop = require("../models/Shop");

const router = express.Router();

console.log("✅ publicPaymentRoutes.js loaded");

const hashToken = (token) =>
  crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

router.post("/upi", async (req, res) => {
  try {
    const orderToken =
      typeof req.body.orderToken === "string"
        ? req.body.orderToken.trim()
        : "";

    const shopCode =
      typeof req.body.shopCode === "string"
        ? req.body.shopCode.trim().toUpperCase()
        : "";

    const upiReference =
      typeof req.body.upiReference === "string"
        ? req.body.upiReference.trim().toUpperCase()
        : "";

    if (!orderToken || !shopCode) {
      return res.status(400).json({
        success: false,
        message:
          "Order token and shop code are required",
      });
    }

    if (
      upiReference.length < 6 ||
      upiReference.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid UPI transaction number",
      });
    }

    const shop = await Shop.findOne({
      shopCode,
      isActive: true,
    }).select(
      "_id paymentEnabled paymentMode upiId"
    );

    if (!shop) {
      return res.status(404).json({
        success: false,
        message:
          "Shop not found or currently unavailable",
      });
    }

    if (
      shop.paymentEnabled === false ||
      !["upi", "both"].includes(
        shop.paymentMode || "both"
      ) ||
      !shop.upiId
    ) {
      return res.status(409).json({
        success: false,
        message:
          "UPI payments are unavailable for this shop",
      });
    }

    const job = await PrintJob.findOne({
      shopId: shop._id,
      publicOrderTokenHash:
        hashToken(orderToken),
      publicOrderExpiresAt: {
        $gt: new Date(),
      },
    }).select(
      "+publicOrderTokenHash +publicOrderExpiresAt"
    );

    if (!job) {
      return res.status(404).json({
        success: false,
        message:
          "Public order not found or link expired",
      });
    }

    if (
      ["Paid", "Refunded"].includes(
        job.paymentStatus
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This payment is already finalized",
      });
    }

    const escapedReference =
      upiReference.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const duplicate =
      await PrintJob.exists({
        _id: { $ne: job._id },
        upiReference: {
          $regex: `^${escapedReference}$`,
          $options: "i",
        },
        paymentStatus: {
          $in: ["Pending", "Paid"],
        },
      });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "This UPI transaction number is already in use",
      });
    }

    job.paymentMethod = "UPI";
    job.paymentStatus = "Pending";
    job.status = "Pending";
    job.upiReference = upiReference;
    job.paymentVerifiedAt = null;
    job.paymentVerifiedBy = null;
    job.paymentNotes =
      "Guest UPI reference submitted; awaiting shop verification";

    await job.save();

    return res.json({
      success: true,
      message:
        "UPI payment submitted. Waiting for shop verification.",
      order: {
        id: job._id,
        paymentMethod:
          job.paymentMethod,
        paymentStatus:
          job.paymentStatus,
        status: job.status,
      },
    });
  } catch (error) {
    console.error(
      "Public UPI payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to submit UPI payment",
    });
  }
});
router.post("/cash", async (req, res) => {
  try {
    const orderToken =
      typeof req.body.orderToken === "string"
        ? req.body.orderToken.trim()
        : "";

    const shopCode =
      typeof req.body.shopCode === "string"
        ? req.body.shopCode.trim().toUpperCase()
        : "";

    if (!orderToken || !shopCode) {
      return res.status(400).json({
        success: false,
        message:
          "Order token and shop code are required",
      });
    }

    const shop = await Shop.findOne({
      shopCode,
      isActive: true,
    }).select("_id");

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const job = await PrintJob.findOne({
      shopId: shop._id,
      publicOrderTokenHash:
        hashToken(orderToken),
      publicOrderExpiresAt: {
        $gt: new Date(),
      },
    }).select(
      "+publicOrderTokenHash +publicOrderExpiresAt"
    );

    if (!job) {
      return res.status(404).json({
        success: false,
        message:
          "Public order not found or link expired",
      });
    }

    if (
      ["Paid", "Refunded"].includes(
        job.paymentStatus
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This payment is already completed",
      });
    }

    job.paymentMethod = "Cash";
    job.paymentStatus = "Pending";
    job.status = "Pending";

    job.upiReference = "";

    job.paymentVerifiedAt = null;
    job.paymentVerifiedBy = null;

    job.paymentNotes =
      "Customer selected Pay at Shop";

    await job.save();

    return res.json({
      success: true,
      message:
        "Cash payment selected successfully.",
      order: {
        id: job._id,
        paymentMethod:
          job.paymentMethod,
        paymentStatus:
          job.paymentStatus,
        status: job.status,
      },
    });
  } catch (error) {
    console.error(
      "Public Cash payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create cash payment",
    });
  }
});

module.exports = router;