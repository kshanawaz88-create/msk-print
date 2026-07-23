const Razorpay = require("razorpay");

const Shop = require("../models/Shop");
const { decryptShopSecret } = require("../utils/shopPaymentEncryption");

const platformFallbackEnabled = () =>
  process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED === "true";

const serviceError = (message, status = 503) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const findShopWithPaymentSecrets = (shopId) => Shop.findById(shopId).select(
  "+razorpayKeySecretEncrypted +razorpayWebhookSecretEncrypted +razorpayKeySecret"
);
const encryptionContext = (shop, purpose) =>
  `shop:${shop._id.toString()}:${purpose}`;

const resolveRazorpayCredentials = (shop) => {
  if (!shop) throw serviceError("The order's shop no longer exists", 404);

  if (shop.razorpayKeyId && shop.razorpayKeySecretEncrypted) {
    return {
      keyId: shop.razorpayKeyId,
      keySecret: decryptShopSecret(
        shop.razorpayKeySecretEncrypted,
        encryptionContext(shop, "razorpay-key-secret")
      ),
      source: "shop",
    };
  }

  if (
    platformFallbackEnabled() &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  ) {
    return {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      source: "platform-fallback",
    };
  }

  if (shop.razorpayKeySecret) {
    throw serviceError(
      "This shop still has a legacy plaintext Razorpay secret. Run the guarded encryption migration before accepting Razorpay payments"
    );
  }
  throw serviceError("Razorpay is not configured for this shop");
};

const resolveWebhookSecret = (shop) => {
  if (!shop) throw serviceError("Shop not found", 404);
  if (shop.razorpayWebhookSecretEncrypted) {
    return decryptShopSecret(
      shop.razorpayWebhookSecretEncrypted,
      encryptionContext(shop, "razorpay-webhook-secret")
    );
  }
  if (platformFallbackEnabled() && process.env.RAZORPAY_WEBHOOK_SECRET) {
    return process.env.RAZORPAY_WEBHOOK_SECRET;
  }
  throw serviceError("Razorpay webhook is not configured for this shop");
};

const createRazorpayClient = ({ keyId, keySecret }) => new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

const modeIncludes = (mode, method) =>
  mode === "both" || mode === method;

const buildPublicPaymentConfiguration = (shop) => {
  const mode = shop.paymentMode || "both";
  const enabled = shop.paymentEnabled !== false && shop.isActive !== false;
  const fallbackAvailable = platformFallbackEnabled() &&
    Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const razorpayConfigured = Boolean(
    (shop.razorpayKeyId && shop.razorpayKeySecretEncrypted) ||
    fallbackAvailable
  );
  const upiConfigured = Boolean(shop.upiId);

  return {
    paymentEnabled: enabled,
    paymentMode: mode,
    upiId: modeIncludes(mode, "upi") ? shop.upiId || "" : "",
    paymentInstructions: shop.paymentInstructions || "",
    razorpayAvailable: enabled && modeIncludes(mode, "razorpay") && razorpayConfigured,
    upiAvailable: enabled && modeIncludes(mode, "upi") && upiConfigured,
  };
};

module.exports = {
  buildPublicPaymentConfiguration,
  createRazorpayClient,
  findShopWithPaymentSecrets,
  modeIncludes,
  platformFallbackEnabled,
  resolveRazorpayCredentials,
  resolveWebhookSecret,
};
