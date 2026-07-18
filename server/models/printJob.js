const mongoose = require("mongoose");

const printJobSchema = new mongoose.Schema(
  {
    // Shop
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },

    // Customer
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Staff
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fileName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      default: "",
    },

    fileUrl: {
      type: String,
      default: "",
    },

    pages: {
      type: Number,
      default: 0,
    },

    copies: {
      type: Number,
      default: 1,
    },

    printType: {
      type: String,
      default: "Black & White",
    },

    side: {
      type: String,
      default: "Single Side",
    },

    paperSize: {
      type: String,
      default: "A4",
    },

    colorMode: {
      type: String,
      default: "Black & White",
    },

    printerName: {
      type: String,
      default: "Printer 1",
    },

    estimatedTime: {
      type: Number,
      default: 0,
    },

    // Pricing
    price: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },

    // Payment
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },

    paymentMethod: {
      type: String,
      enum: ["UPI", "Razorpay", "Cash", ""],
      default: "",
    },

    razorpayOrderId: {
      type: String,
      default: "",
    },

    razorpayPaymentId: {
      type: String,
      default: "",
    },

    razorpaySignature: {
      type: String,
      default: "",
    },

    upiReference: {
      type: String,
      default: "",
    },

    invoiceNumber: {
      type: String,
      default: "",
    },

    // Print Status
    status: {
      type: String,
      enum: [
        "Pending",
        "Printing",
        "Ready",
        "Completed",
        "Cancelled",
      ],
      default: "Pending",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PrintJob", printJobSchema);