const mongoose = require("mongoose");

const Shop = require("../models/Shop");
const PrintJob = require("../models/printJob");
const {
  encryptShopSecret,
} = require("../utils/shopPaymentEncryption");
const {
  modeIncludes,
  platformFallbackEnabled,
} = require("../services/shopPaymentService");

const UPI_ID = /^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9.-]{2,64}$/;
const RAZORPAY_KEY_ID = /^rzp_(test|live)_[a-zA-Z0-9]{6,}$/;
const PAYMENT_MODES = ["razorpay", "upi", "both"];

const canManageShop = (req, shopId) =>
  req.user.role === "admin" ||
  (
    req.user.role === "shopOwner" &&
    req.user.shopId?.toString() === shopId.toString()
  );

const paymentSettingsDto = (shop, req) => ({
  shopId: shop._id,
  shopName: shop.shopName,
  paymentMode: shop.paymentMode || "both",
  upiId: shop.upiId || "",
  razorpayKeyId: shop.razorpayKeyId || "",
  paymentEnabled: shop.paymentEnabled !== false,
  paymentInstructions: shop.paymentInstructions || "",
  hasRazorpaySecret: Boolean(shop.razorpayKeySecretEncrypted),
  hasWebhookSecret: Boolean(shop.razorpayWebhookSecretEncrypted),
  hasLegacyPlaintextSecret: Boolean(shop.razorpayKeySecret),
  webhookUrl: `${req.protocol}://${req.get("host")}/api/payment/webhook/${shop._id}`,
});

const findPaymentShop = (id) => Shop.findById(id).select(
  "+razorpayKeySecretEncrypted +razorpayWebhookSecretEncrypted +razorpayKeySecret"
);

const validateShopId = (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) return true;
  res.status(400).json({ success: false, message: "Invalid shop ID" });
  return false;
};

const authorize = (req, res, shopId) => {
  if (canManageShop(req, shopId)) return true;
  res.status(403).json({
    success: false,
    message: "You cannot manage payment settings for this shop",
  });
  return false;
};

const getPaymentSettings = async (req, res, next) => {
  try {
    if (!validateShopId(req, res)) return;
    if (!authorize(req, res, req.params.id)) return;
    const shop = await findPaymentShop(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }
    return res.json({
      success: true,
      paymentSettings: paymentSettingsDto(shop, req),
    });
  } catch (error) {
    next(error);
  }
};

const updatePaymentSettings = async (req, res, next) => {
  try {
    if (!validateShopId(req, res)) return;
    if (!authorize(req, res, req.params.id)) return;
    const shop = await findPaymentShop(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }
    if (
      req.body.razorpayKeySecretEncrypted !== undefined ||
      req.body.razorpayWebhookSecretEncrypted !== undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Encrypted payment fields cannot be submitted through this API",
      });
    }
    const mode = req.body.paymentMode === undefined
      ? shop.paymentMode || "both"
      : String(req.body.paymentMode).trim();
    if (!PAYMENT_MODES.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "Payment mode must be razorpay, upi, or both",
      });
    }

    if (
      req.body.paymentEnabled !== undefined &&
      typeof req.body.paymentEnabled !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment enabled must be true or false",
      });
    }
    const enabled = req.body.paymentEnabled === undefined
      ? shop.paymentEnabled !== false
      : req.body.paymentEnabled;

    const upiId = req.body.upiId === undefined
      ? shop.upiId || ""
      : String(req.body.upiId).trim();
    if (upiId && !UPI_ID.test(upiId)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid UPI ID such as shop@bank",
      });
    }

    const keyId = req.body.razorpayKeyId === undefined
      ? shop.razorpayKeyId || ""
      : String(req.body.razorpayKeyId).trim();
    if (keyId && !RAZORPAY_KEY_ID.test(keyId)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Razorpay key ID",
      });
    }

    const instructions = req.body.paymentInstructions === undefined
      ? shop.paymentInstructions || ""
      : String(req.body.paymentInstructions).trim();
    if (instructions.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Payment instructions cannot exceed 1000 characters",
      });
    }

    const keySecret = typeof req.body.razorpayKeySecret === "string"
      ? req.body.razorpayKeySecret.trim()
      : "";
    const webhookSecret = typeof req.body.razorpayWebhookSecret === "string"
      ? req.body.razorpayWebhookSecret.trim()
      : "";
    const clearKeySecret = req.body.clearRazorpayKeySecret === true;
    const clearWebhookSecret = req.body.clearRazorpayWebhookSecret === true;

    if (keySecret && clearKeySecret) {
      return res.status(400).json({
        success: false,
        message: "Cannot set and clear the Razorpay key secret in the same request",
      });
    }
    if (webhookSecret && clearWebhookSecret) {
      return res.status(400).json({
        success: false,
        message: "Cannot set and clear the webhook secret in the same request",
      });
    }
    if (keySecret && (keySecret.length < 8 || keySecret.length > 255)) {
      return res.status(400).json({
        success: false,
        message: "Razorpay key secret must contain 8 to 255 characters",
      });
    }
    if (webhookSecret && (webhookSecret.length < 8 || webhookSecret.length > 255)) {
      return res.status(400).json({
        success: false,
        message: "Webhook secret must contain 8 to 255 characters",
      });
    }

    const changesRazorpayCredentials =
      keySecret ||
      clearKeySecret ||
      (
        req.body.razorpayKeyId !== undefined &&
        keyId !== (shop.razorpayKeyId || "")
      );
    if (
      changesRazorpayCredentials &&
      await PrintJob.exists({
        shopId: shop._id,
        paymentMethod: "Razorpay",
        paymentStatus: { $in: ["Pending", "Failed"] },
        razorpayOrderId: { $nin: ["", null] },
      })
    ) {
      return res.status(409).json({
        success: false,
        message: "Razorpay credentials cannot be changed while this shop has pending Razorpay orders",
      });
    }

    const willHaveKeySecret = keySecret
      ? true
      : clearKeySecret
      ? false
      : Boolean(shop.razorpayKeySecretEncrypted);
    const fallbackConfigured = platformFallbackEnabled() &&
      Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

    if (enabled && modeIncludes(mode, "upi") && !upiId) {
      return res.status(400).json({
        success: false,
        message: "A UPI ID is required for the selected payment mode",
      });
    }
    if (
      enabled &&
      modeIncludes(mode, "razorpay") &&
      (!(keyId && willHaveKeySecret) && !fallbackConfigured)
    ) {
      return res.status(400).json({
        success: false,
        message: "A Razorpay key ID and encrypted key secret are required for the selected payment mode",
      });
    }

    shop.paymentMode = mode;
    shop.paymentEnabled = enabled;
    shop.upiId = upiId;
    shop.razorpayKeyId = keyId;
    shop.paymentInstructions = instructions;

    if (keySecret) {
      shop.razorpayKeySecretEncrypted = encryptShopSecret(
        keySecret,
        `shop:${shop._id}:razorpay-key-secret`
      );
    } else if (clearKeySecret) {
      shop.razorpayKeySecretEncrypted = "";
    }
    if (webhookSecret) {
      shop.razorpayWebhookSecretEncrypted = encryptShopSecret(
        webhookSecret,
        `shop:${shop._id}:razorpay-webhook-secret`
      );
    } else if (clearWebhookSecret) {
      shop.razorpayWebhookSecretEncrypted = "";
    }

    await shop.save();
    return res.json({
      success: true,
      message: "Shop payment settings updated successfully",
      paymentSettings: paymentSettingsDto(shop, req),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPaymentSettings,
  updatePaymentSettings,
};
