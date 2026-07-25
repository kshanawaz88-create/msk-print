const mongoose = require("mongoose");

const ShopSettings = require("../models/ShopSettings");

const DEFAULT_PRICING = Object.freeze({
  blackWhitePrice: 2,
  colorPrice: 10,
  a3Price: 15,
  gst: 18,
});

const pricingError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  error.expose = status < 500;
  return error;
};

const normalizeShopId = (shopId) => {
  const value = shopId?._id || shopId;
  if (value === undefined || value === null || value === "") return null;
  if (!mongoose.isValidObjectId(value)) {
    throw pricingError("Shop pricing scope is invalid", 500);
  }
  return value;
};

const loadPricingSettings = async (shopId) => {
  const normalizedShopId = normalizeShopId(shopId);
  let settings = null;

  if (normalizedShopId) {
    settings = await ShopSettings.findOne({ shopId: normalizedShopId })
      .sort({ updatedAt: -1, _id: 1 })
      .lean();
  }

  if (!settings) {
    settings = await ShopSettings.findOne({ shopId: null })
      .sort({ updatedAt: -1, _id: 1 })
      .lean();
  }

  return settings;
};

const normalizeOptions = ({ copies, printType, side, paperSize }) => {
  const normalizedCopies = Number(copies);

  if (!Number.isInteger(normalizedCopies) || normalizedCopies < 1 || normalizedCopies > 1000) {
    throw pricingError("Copies must be a whole number between 1 and 1000");
  }
  if (!["Black & White", "Color"].includes(printType)) {
    throw pricingError("Invalid print type");
  }
  if (!["Single Side", "Double Side"].includes(side)) {
    throw pricingError("Invalid printing side");
  }
  if (!["A4", "A3"].includes(paperSize)) {
    throw pricingError("Invalid paper size");
  }

  return { copies: normalizedCopies, printType, side, paperSize };
};

const calculatePrice = async (pages, options, shopId = null) => {
  const normalized = normalizeOptions(options);
  const pageCount = Number(pages);

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw pricingError("This file does not have a valid page count");
  }

  const settings = await loadPricingSettings(shopId);
  const configured = settings || DEFAULT_PRICING;
  let rate = normalized.printType === "Color"
    ? Number(configured.colorPrice ?? DEFAULT_PRICING.colorPrice)
    : Number(configured.blackWhitePrice ?? DEFAULT_PRICING.blackWhitePrice);

  if (normalized.paperSize === "A3") {
    rate = Number(configured.a3Price ?? DEFAULT_PRICING.a3Price);
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw pricingError("Shop pricing is not configured correctly", 500);
  }

  const sheets = normalized.side === "Double Side"
    ? Math.ceil(pageCount / 2)
    : pageCount;
  const subtotal = sheets * normalized.copies * rate;
  const gst = Math.max(Number(configured.gst ?? DEFAULT_PRICING.gst), 0);
  if (!Number.isFinite(gst) || gst > 100) {
    throw pricingError("Shop GST setting is invalid", 500);
  }

  const gstAmount = Number((subtotal * gst / 100).toFixed(2));
  const price = Number((subtotal + gstAmount).toFixed(2));

  return {
    ...normalized,
    price,
    breakdown: {
      pages: pageCount,
      sheets,
      copies: normalized.copies,
      rate,
      subtotal: Number(subtotal.toFixed(2)),
      gstPercent: gst,
      gstAmount,
      total: price,
    },
  };
};

module.exports = {
  DEFAULT_PRICING,
  calculatePrice,
  loadPricingSettings,
  normalizeOptions,
};
