const mongoose = require("mongoose");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (res, message) => res.status(400).json({ success: false, message });
const text = (value) => typeof value === "string" ? value.trim() : "";

const validateAuth = (register) => (req, res, next) => {
  if (register && (text(req.body.fullName).length < 2 || text(req.body.fullName).length > 100)) {
    return fail(res, "Full name must contain 2 to 100 characters");
  }
  if (!EMAIL.test(text(req.body.email).toLowerCase())) {
    return fail(res, "Enter a valid email address");
  }
  if (typeof req.body.password !== "string" || req.body.password.length < 6 || req.body.password.length > 128) {
    return fail(res, "Password must contain 6 to 128 characters");
  }
  next();
};

const validatePaymentOptions = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.body.printJobId)) return fail(res, "Invalid print job ID");
  const copies = Number(req.body.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 1000) return fail(res, "Copies must be between 1 and 1000");
  if (!["Black & White", "Color"].includes(req.body.printType)) return fail(res, "Invalid print type");
  if (!["Single Side", "Double Side"].includes(req.body.side)) return fail(res, "Invalid printing side");
  if (!["A4", "A3"].includes(req.body.paperSize)) return fail(res, "Invalid paper size");
  next();
};

const validateRazorpayVerification = (req, res, next) => {
  const fields = ["printJobId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"];
  if (!mongoose.isValidObjectId(req.body.printJobId) ||
      fields.slice(1).some((field) => !text(req.body[field]) || text(req.body[field]).length > 255)) {
    return fail(res, "Payment verification details are incomplete or invalid");
  }
  next();
};

const validateUpi = (req, res, next) => {
  const reference = text(req.body.upiReference);
  if (reference.length < 6 || reference.length > 100 || !/^[a-zA-Z0-9._-]+$/.test(reference)) {
    return fail(res, "Enter a valid UPI transaction reference");
  }
  return validatePaymentOptions(req, res, next);
};

const validateUpiDecision = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, "Invalid print job ID");
  if (!["approve", "reject"].includes(req.body.decision)) return fail(res, "Decision must be approve or reject");
  if (req.body.notes !== undefined && text(req.body.notes).length > 500) return fail(res, "Notes cannot exceed 500 characters");
  next();
};

const validateShop = (creating) => (req, res, next) => {
  if (creating || req.body.shopName !== undefined) {
    if (text(req.body.shopName).length < 2 || text(req.body.shopName).length > 120) return fail(res, "Shop name must contain 2 to 120 characters");
  }
  if (creating || req.body.ownerName !== undefined) {
    if (text(req.body.ownerName).length < 2 || text(req.body.ownerName).length > 100) return fail(res, "Owner name must contain 2 to 100 characters");
  }
  if (creating || req.body.email !== undefined) {
    if (!EMAIL.test(text(req.body.email).toLowerCase())) return fail(res, "Enter a valid shop email");
  }
  if (req.body.shopOwner && !mongoose.isValidObjectId(req.body.shopOwner)) return fail(res, "Invalid shop owner ID");
  next();
};

const validateStaff = (creating) => (req, res, next) => {
  if (creating || req.body.fullName !== undefined) {
    if (text(req.body.fullName).length < 2 || text(req.body.fullName).length > 100) return fail(res, "Staff name must contain 2 to 100 characters");
  }
  if (creating || req.body.email !== undefined) {
    if (!EMAIL.test(text(req.body.email).toLowerCase())) return fail(res, "Enter a valid staff email");
  }
  if (creating || (req.body.password !== undefined && req.body.password !== "")) {
    if (typeof req.body.password !== "string" || req.body.password.length < 6 || req.body.password.length > 128) return fail(res, "Password must contain 6 to 128 characters");
  }
  if ((creating || req.body.shopId !== undefined) && !mongoose.isValidObjectId(req.body.shopId)) return fail(res, "Invalid shop ID");
  if (req.body.assignedPrinter !== undefined && text(req.body.assignedPrinter).length > 100) return fail(res, "Printer name cannot exceed 100 characters");
  next();
};

const validatePrintUpdate = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, "Invalid print job ID");
  const allowedStatuses = ["Pending", "Printing", "Ready", "Completed", "Cancelled"];
  if (req.body.status !== undefined && !allowedStatuses.includes(req.body.status)) return fail(res, "Invalid order status");
  if (req.user.role === "customer") {
    const forbidden = ["paymentStatus", "paymentMethod", "status", "price", "user", "shopId", "assignedStaff"];
    if (forbidden.some((field) => req.body[field] !== undefined)) return fail(res, "Customers can only update print options");
    const copies = Number(req.body.copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) return fail(res, "Copies must be between 1 and 1000");
    if (!["Black & White", "Color"].includes(req.body.printType)) return fail(res, "Invalid print type");
    if (!["Single Side", "Double Side"].includes(req.body.side)) return fail(res, "Invalid printing side");
    if (!["A4", "A3"].includes(req.body.paperSize)) return fail(res, "Invalid paper size");
  }
  next();
};

module.exports = {
  validateAuth,
  validatePaymentOptions,
  validateRazorpayVerification,
  validateUpi,
  validateUpiDecision,
  validateShop,
  validateStaff,
  validatePrintUpdate,
};
