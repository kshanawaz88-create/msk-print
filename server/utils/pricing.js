const ShopSettings = require("../models/ShopSettings");

const DEFAULT_PRICING = Object.freeze({
  blackWhitePrice: 2,
  colorPrice: 10,
  a3Price: 15,
  gst: 18,
});

const normalizeOptions = ({ copies, printType, side, paperSize }) => {
  const normalizedCopies = Number(copies);

  if (!Number.isInteger(normalizedCopies) || normalizedCopies < 1 || normalizedCopies > 1000) {
    throw new Error("Copies must be a whole number between 1 and 1000");
  }
  if (!["Black & White", "Color"].includes(printType)) {
    throw new Error("Invalid print type");
  }
  if (!["Single Side", "Double Side"].includes(side)) {
    throw new Error("Invalid printing side");
  }
  if (!["A4", "A3"].includes(paperSize)) {
    throw new Error("Invalid paper size");
  }

  return { copies: normalizedCopies, printType, side, paperSize };
};

const calculatePrice = async (pages, options) => {
  const normalized = normalizeOptions(options);
  const pageCount = Number(pages);

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("This file does not have a valid page count");
  }

  const settings = await ShopSettings.findOne().lean();
  const configured = settings || DEFAULT_PRICING;
  let rate = normalized.printType === "Color"
    ? Number(configured.colorPrice ?? DEFAULT_PRICING.colorPrice)
    : Number(configured.blackWhitePrice ?? DEFAULT_PRICING.blackWhitePrice);

  if (normalized.paperSize === "A3") {
    rate = Number(configured.a3Price ?? DEFAULT_PRICING.a3Price);
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Shop pricing is not configured correctly");
  }

  const sheets = normalized.side === "Double Side"
    ? Math.ceil(pageCount / 2)
    : pageCount;
  const subtotal = sheets * normalized.copies * rate;
  const gst = Math.max(Number(configured.gst ?? DEFAULT_PRICING.gst), 0);
  if (!Number.isFinite(gst) || gst > 100) {
    throw new Error("Shop GST setting is invalid");
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

module.exports = { calculatePrice };
