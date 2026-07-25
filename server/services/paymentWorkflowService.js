const crypto = require("crypto");

const PrintJob = require("../models/printJob");
const { createInvoiceNumber } = require("../utils/invoice");
const { emitOrderUpdate } = require("../socket");

const RAZORPAY_CREATION_LOCK_MS = 2 * 60 * 1000;
const FINAL_PAYMENT_STATUSES = new Set(["Paid", "Refunded"]);

const workflowError = (message, status = 409, code = "PAYMENT_CONFLICT") => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const boundedNote = (value, fallback) => {
  const note = typeof value === "string" ? value.trim() : "";
  return (note || fallback).slice(0, 500);
};

const centsFor = (price) => {
  const amount = Math.round(Number(price) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw workflowError("The calculated payment amount is invalid", 400, "INVALID_AMOUNT");
  }
  return amount;
};

const assertPaymentCanStart = (job, method) => {
  if (FINAL_PAYMENT_STATUSES.has(job.paymentStatus)) {
    throw workflowError("This payment is already finalized");
  }

  const existingMethod = job.paymentMethod || "";
  if (existingMethod && existingMethod !== method) {
    throw workflowError(
      `This order already has a ${existingMethod} payment in progress. Complete or review that payment before selecting another method.`,
      409,
      "PAYMENT_METHOD_LOCKED"
    );
  }
};

const quoteFields = (calculated) => ({
  copies: calculated.copies,
  printType: calculated.printType,
  colorMode: calculated.printType,
  side: calculated.side,
  paperSize: calculated.paperSize,
  price: calculated.price,
  invoiceSubtotal: calculated.breakdown.subtotal,
  invoiceGstRate: calculated.breakdown.gstPercent,
  invoiceGstAmount: calculated.breakdown.gstAmount,
});

const quoteMatchesJob = (job, calculated) =>
  Number(job.copies) === Number(calculated.copies) &&
  job.printType === calculated.printType &&
  job.side === calculated.side &&
  job.paperSize === calculated.paperSize &&
  Number(job.price) === Number(calculated.price);

const emitPaymentUpdate = (job) => {
  if (!job?._id || !job?.shopId) return;
  emitOrderUpdate({
    orderToken: job._id.toString(),
    shopId: job.shopId.toString(),
    order: typeof job.toObject === "function" ? job.toObject() : job,
  });
};

const verifyRazorpaySignature = ({ orderId, paymentId, signature, keySecret }) => {
  if (![orderId, paymentId, signature, keySecret].every((value) => typeof value === "string" && value)) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
};

const existingRazorpayResponse = (job, credentials, calculated) => {
  const amount = Number(job.razorpayAmount) || centsFor(job.price);
  const requestedAmount = centsFor(calculated.price);
  if (amount !== requestedAmount || !quoteMatchesJob(job, calculated)) {
    throw workflowError(
      "A Razorpay order already exists for different print options",
      409,
      "RAZORPAY_OPTIONS_LOCKED"
    );
  }
  return {
    keyId: credentials.keyId,
    order: {
      id: job.razorpayOrderId,
      amount,
      currency: job.currency || "INR",
      receipt: `MSK-${job._id}`,
      status: "created",
    },
    quote: { ...calculated, currency: job.currency || "INR" },
    existing: true,
  };
};

const createRazorpayOrder = async ({ job, shop, calculated, paymentService }) => {
  assertPaymentCanStart(job, "Razorpay");
  const credentials = paymentService.resolveRazorpayCredentials(shop);
  const amount = centsFor(calculated.price);

  if (job.razorpayOrderId) {
    return existingRazorpayResponse(job, credentials, calculated);
  }

  const lockToken = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - RAZORPAY_CREATION_LOCK_MS);
  const reserved = await PrintJob.findOneAndUpdate(
    {
      _id: job._id,
      paymentStatus: { $nin: ["Paid", "Refunded"] },
      paymentMethod: { $in: ["", null, "Razorpay"] },
      razorpayOrderId: { $in: ["", null] },
      $or: [
        { razorpayOrderCreationToken: { $in: ["", null] } },
        { razorpayOrderCreationStartedAt: { $lte: staleBefore } },
      ],
    },
    {
      $set: {
        ...quoteFields(calculated),
        paymentMethod: "Razorpay",
        paymentStatus: "Pending",
        razorpayAmount: amount,
        razorpayOrderCreationToken: lockToken,
        razorpayOrderCreationStartedAt: new Date(),
        paymentVerifiedAt: null,
        paymentVerifiedBy: null,
        paymentNotes: "Creating Razorpay order",
      },
    },
    { returnDocument: "after", runValidators: true }
  ).select("+razorpayAmount +razorpayOrderCreationToken +razorpayOrderCreationStartedAt");

  if (!reserved) {
    const current = await PrintJob.findById(job._id).select(
      "+razorpayAmount +razorpayOrderCreationToken +razorpayOrderCreationStartedAt"
    );
    if (current?.razorpayOrderId) {
      return existingRazorpayResponse(current, credentials, calculated);
    }
    assertPaymentCanStart(current || job, "Razorpay");
    throw workflowError(
      "A Razorpay order is already being created. Please retry shortly.",
      409,
      "RAZORPAY_ORDER_IN_PROGRESS"
    );
  }

  let razorpayOrder;
  try {
    razorpayOrder = await paymentService.createRazorpayClient(credentials).orders.create({
      amount,
      currency: "INR",
      receipt: `MSK-${job._id}`,
      notes: {
        shopId: shop._id.toString(),
        printJobId: job._id.toString(),
      },
    });
  } catch (error) {
    await PrintJob.updateOne(
      { _id: job._id, razorpayOrderCreationToken: lockToken },
      {
        $set: {
          razorpayOrderCreationToken: "",
          razorpayOrderCreationStartedAt: null,
          paymentNotes: "Razorpay order creation failed; retry is allowed",
        },
      }
    ).catch(() => {});
    throw error;
  }

  let updated = await PrintJob.findOneAndUpdate(
    { _id: job._id, razorpayOrderCreationToken: lockToken },
    {
      $set: {
        razorpayOrderId: razorpayOrder.id,
        razorpayAmount: amount,
        razorpayOrderCreationToken: "",
        razorpayOrderCreationStartedAt: null,
        paymentNotes: "Awaiting Razorpay signature verification",
      },
    },
    { returnDocument: "after", runValidators: true }
  ).select("+razorpayAmount");

  // A lock can only disappear here through an overlapping recovery request.
  // The payment-method lock makes this guarded second link safe and avoids
  // leaving a successfully-created provider order detached from its job.
  if (!updated) {
    updated = await PrintJob.findOneAndUpdate(
      {
        _id: job._id,
        paymentMethod: "Razorpay",
        paymentStatus: { $nin: ["Paid", "Refunded"] },
        razorpayOrderId: { $in: ["", null] },
      },
      {
        $set: {
          razorpayOrderId: razorpayOrder.id,
          razorpayAmount: amount,
          razorpayOrderCreationToken: "",
          razorpayOrderCreationStartedAt: null,
          paymentNotes: "Awaiting Razorpay signature verification",
        },
      },
      { returnDocument: "after", runValidators: true }
    ).select("+razorpayAmount");
  }

  if (!updated) {
    throw workflowError(
      "The Razorpay order was created but could not be linked safely. Contact support before retrying.",
      503,
      "RAZORPAY_LINK_FAILED"
    );
  }

  emitPaymentUpdate(updated);
  return {
    keyId: credentials.keyId,
    order: {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: razorpayOrder.status,
    },
    quote: { ...calculated, currency: updated.currency || "INR" },
    job: updated,
    existing: false,
  };
};

const finalizeRazorpayPayment = async ({ job, paymentId, signature, verifiedBy = null, note }) => {
  const duplicate = await PrintJob.exists({
    _id: { $ne: job._id },
    razorpayPaymentId: paymentId,
    paymentStatus: "Paid",
  });
  if (duplicate) {
    throw workflowError(
      "This Razorpay payment is already linked to another order",
      409,
      "DUPLICATE_RAZORPAY_PAYMENT"
    );
  }

  const updated = await PrintJob.findOneAndUpdate(
    {
      _id: job._id,
      paymentMethod: "Razorpay",
      razorpayOrderId: job.razorpayOrderId,
      paymentStatus: { $in: ["Pending", "Failed"] },
    },
    {
      $set: {
        paymentStatus: "Paid",
        razorpayPaymentId: paymentId,
        razorpaySignature: signature || "",
        paymentVerifiedAt: new Date(),
        paymentVerifiedBy: verifiedBy,
        invoiceNumber: job.invoiceNumber || createInvoiceNumber(job._id),
        paymentNotes: boundedNote(
          note,
          job.status === "Cancelled"
            ? "Razorpay payment verified for a cancelled order; manual refund review required"
            : "Razorpay payment verified by server"
        ),
        razorpayOrderCreationToken: "",
        razorpayOrderCreationStartedAt: null,
      },
    },
    { returnDocument: "after", runValidators: true }
  );

  if (updated) {
    emitPaymentUpdate(updated);
    return { job: updated, idempotent: false };
  }

  const current = await PrintJob.findById(job._id);
  if (current?.paymentStatus === "Paid" && current.razorpayPaymentId === paymentId) {
    return { job: current, idempotent: true };
  }
  throw workflowError("This payment was already finalized", 409, "PAYMENT_FINALIZED");
};

const decideManualPayment = async ({ job, method, decision, actorId, notes }) => {
  const targetStatus = decision === "approve" ? "Paid" : "Rejected";
  if (job.paymentStatus === targetStatus) {
    return { job, idempotent: true };
  }
  if (job.paymentStatus !== "Pending") {
    throw workflowError(
      `This ${method} payment has already been reviewed`,
      409,
      "PAYMENT_REVIEWED"
    );
  }
  if (decision === "approve" && job.status === "Cancelled") {
    throw workflowError(
      "A cancelled order cannot be approved for printing",
      409,
      "CANCELLED_ORDER"
    );
  }

  const set = {
    paymentStatus: targetStatus,
    paymentVerifiedAt: new Date(),
    paymentVerifiedBy: actorId,
    paymentNotes: boundedNote(
      notes,
      `${method} payment ${decision === "approve" ? "approved" : "rejected"}`
    ),
  };
  if (decision === "approve") {
    set.invoiceNumber = job.invoiceNumber || createInvoiceNumber(job._id);
  }

  const filter = {
    _id: job._id,
    paymentMethod: method,
    paymentStatus: "Pending",
  };
  if (decision === "approve") filter.status = { $ne: "Cancelled" };

  const updated = await PrintJob.findOneAndUpdate(
    filter,
    { $set: set },
    { returnDocument: "after", runValidators: true }
  );
  if (updated) {
    emitPaymentUpdate(updated);
    return { job: updated, idempotent: false };
  }

  const current = await PrintJob.findById(job._id);
  if (current?.paymentStatus === targetStatus) return { job: current, idempotent: true };
  throw workflowError(
    current?.status === "Cancelled"
      ? "A cancelled order cannot be approved for printing"
      : `This ${method} payment was reviewed by another request`,
    409,
    "PAYMENT_REVIEWED"
  );
};

module.exports = {
  assertPaymentCanStart,
  boundedNote,
  centsFor,
  createRazorpayOrder,
  decideManualPayment,
  emitPaymentUpdate,
  finalizeRazorpayPayment,
  quoteFields,
  quoteMatchesJob,
  verifyRazorpaySignature,
  workflowError,
};
