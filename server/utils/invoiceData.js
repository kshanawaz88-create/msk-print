const ShopSettings = require("../models/ShopSettings");
const { createInvoiceNumber } = require("./invoice");

const text = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const buildInvoiceData = async (job) => {
  const settings = await ShopSettings.findOne().lean();
  const shop = job.shopId || {};
  const customer = job.user || {};
  const total = Math.max(Number(job.price) || 0, 0);
  const gstRate = Math.min(Math.max(Number(settings?.gst) || 0, 0), 100);
  const subtotal = Number.isFinite(Number(job.invoiceSubtotal))
    ? Number(Number(job.invoiceSubtotal).toFixed(2))
    : Number((total / (1 + gstRate / 100)).toFixed(2));
  const effectiveGstRate = Number.isFinite(Number(job.invoiceGstRate))
    ? Number(job.invoiceGstRate)
    : gstRate;
  const gstAmount = Number.isFinite(Number(job.invoiceGstAmount))
    ? Number(Number(job.invoiceGstAmount).toFixed(2))
    : Number((total - subtotal).toFixed(2));
  const invoiceNumber = text(job.invoiceNumber) || createInvoiceNumber(job._id);

  return {
    id: job._id.toString(),
    invoiceNumber,
    invoiceDate: job.paymentVerifiedAt || job.updatedAt || job.createdAt,
    shop: {
      logo: text(shop.logo, text(settings?.logo)),
      name: text(shop.shopName, text(settings?.shopName, "MSK Print Cloud")),
      branchName: text(shop.branchName, "Main Branch"),
      address: text(shop.address, text(settings?.address)),
      phone: text(shop.phone, text(settings?.phone)),
      email: text(shop.email, text(settings?.email)),
      gstNumber: text(shop.gstNumber),
    },
    customer: {
      name: text(customer.fullName, "Customer"),
      email: text(customer.email),
    },
    order: {
      fileName: text(job.fileName, "Print file"),
      pages: Math.max(Number(job.pages) || 0, 0),
      copies: Math.max(Number(job.copies) || 1, 1),
      paperSize: text(job.paperSize, "A4"),
      printType: text(job.printType, "Black & White"),
      side: text(job.side, "Single Side"),
      status: text(job.status, "Pending"),
    },
    amounts: {
      subtotal,
      gstRate: effectiveGstRate,
      gstAmount,
      total: Number(total.toFixed(2)),
      currency: text(job.currency, "INR"),
    },
    payment: {
      method: text(job.paymentMethod),
      status: text(job.paymentStatus),
      razorpayPaymentId:
        job.paymentMethod === "Razorpay" ? text(job.razorpayPaymentId) : "",
      upiReference:
        job.paymentMethod === "UPI" ? text(job.upiReference) : "",
    },
  };
};

module.exports = { buildInvoiceData };
