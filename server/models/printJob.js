const mongoose = require("mongoose");
const { createInvoiceNumber } = require("../utils/invoice");

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
    // Public QR/guest order access
isGuestOrder: {
  type: Boolean,
  default: false,
},

publicOrderTokenHash: {
  type: String,
  default: "",
  select: false,
},

publicOrderExpiresAt: {
  type: Date,
  default: null,
  select: false,
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

    cloudinaryPublicId: {
      type: String,
      default: "",
      select: false,
    },

    cloudinaryDeliveryType: {
      type: String,
      enum: ["upload", "private", "authenticated"],
      default: "upload",
      select: false,
    },

    fileMimeType: {
      type: String,
      default: "",
      select: false,
    },

    fileSize: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
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
      default: "",
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
    invoiceSubtotal: {
      type: Number,
      min: 0,
    },
    invoiceGstRate: {
      type: Number,
      min: 0,
      max: 100,
    },
    invoiceGstAmount: {
      type: Number,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },

    // Payment
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Rejected", "Refunded"],
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

    razorpayAmount: {
      type: Number,
      min: 0,
      default: 0,
      select: false,
    },

    razorpayPaymentId: {
      type: String,
      default: "",
    },

    razorpaySignature: {
      type: String,
      default: "",
      select: false,
    },

    upiReference: {
      type: String,
      default: "",
    },

    invoiceNumber: {
      type: String,
      trim: true,
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
        "Error",
      ],
      default: "Pending",
    },

    printStartedAt: {
      type: Date,
      default: null,
    },

    printCompletedAt: {
      type: Date,
      default: null,
    },

    errorReason: {
      type: String,
      default: "",
      maxlength: 500,
    },

    printClaimHash: {
      type: String,
      default: "",
      select: false,
    },

    printAgentSessionId: {
      type: String,
      default: "",
      select: false,
    },

    printClaimedAt: {
      type: Date,
      default: null,
    },

    printAttemptCount: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },

    notes: {
      type: String,
      default: "",
    },
    paymentVerifiedAt: {
      type: Date,
      default: null,
    },
    paymentVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    paymentNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

printJobSchema.index({ user: 1, createdAt: -1 });
printJobSchema.index({ shopId: 1, createdAt: -1 });
printJobSchema.index({ assignedStaff: 1, createdAt: -1 });
printJobSchema.index({ status: 1, createdAt: -1 });
printJobSchema.index({ paymentStatus: 1, createdAt: -1 });
printJobSchema.index({ createdAt: -1 });
printJobSchema.index({ razorpayOrderId: 1 });
printJobSchema.index({
  shopId: 1,
  paymentStatus: 1,
  status: 1,
  createdAt: 1,
  _id: 1,
});
printJobSchema.index(
  { invoiceNumber: 1 },
  { unique: true, sparse: true, name: "invoiceNumber_1" }
);
printJobSchema.index(
  { publicOrderTokenHash: 1 },
  {
    unique: true,
    sparse: true,
    name: "publicOrderTokenHash_1",
  }
);

printJobSchema.pre("validate", function assignInvoiceNumber() {
  if (this.paymentStatus === "Paid" && !this.invoiceNumber) {
    this.invoiceNumber = createInvoiceNumber(this._id);
  }
});

printJobSchema.set("toJSON", {
  transform: function (_doc, ret) {
    delete ret.razorpaySignature;
    delete ret.razorpayAmount;
    delete ret.filePath;
    delete ret.fileUrl;
    delete ret.cloudinaryPublicId;
    delete ret.cloudinaryDeliveryType;
    delete ret.fileMimeType;
    delete ret.fileSize;
    delete ret.printClaimHash;
    delete ret.printAgentSessionId;
    delete ret.printAttemptCount;
    delete ret.publicOrderTokenHash;
delete ret.publicOrderExpiresAt;
    if (ret.paymentStatus === "Paid") {
      if (!ret.invoiceNumber && ret._id) {
        ret.invoiceNumber = createInvoiceNumber(ret._id);
      }
    } else {
      delete ret.invoiceNumber;
    }
    return ret;
  },
});

module.exports = mongoose.model("PrintJob", printJobSchema);
