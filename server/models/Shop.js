const crypto = require("crypto");
const mongoose = require("mongoose");

const generateShopCode = () =>
  `MSK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const shopSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    ownerName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    website: {
      type: String,
      default: "",
      trim: true,
    },

    logo: {
      type: String,
      default: "",
      trim: true,
    },

    qrCode: {
      type: String,
      default: "",
      trim: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ===== SaaS Features =====

    shopCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    subscriptionPlan: {
      type: String,
      enum: ["Free", "Basic", "Pro", "Enterprise"],
      default: "Free",
    },

    maxOrdersPerMonth: {
      type: Number,
      default: 50,
      min: 0,
    },

    themeColor: {
      type: String,
      default: "#0d6efd",
      trim: true,
    },

    gstNumber: {
      type: String,
      default: "",
      trim: true,
    },

    upiId: {
      type: String,
      default: "",
      trim: true,
    },

    paymentMode: {
      type: String,
      enum: ["razorpay", "upi", "both"],
      default: "both",
    },

    paymentEnabled: {
      type: Boolean,
      default: true,
    },

    paymentInstructions: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    openingTime: {
      type: String,
      default: "09:00 AM",
      trim: true,
    },

    closingTime: {
      type: String,
      default: "08:00 PM",
      trim: true,
    },

    branchName: {
      type: String,
      default: "Main Branch",
      trim: true,
    },

    city: {
      type: String,
      default: "",
      trim: true,
    },

    state: {
      type: String,
      default: "",
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      trim: true,
    },

    postalCode: {
      type: String,
      default: "",
      trim: true,
    },

    razorpayKeyId: {
      type: String,
      default: "",
      trim: true,
    },

    // Legacy plaintext field retained temporarily for migration only.
    razorpayKeySecret: {
      type: String,
      default: "",
      select: false,
    },

    razorpayKeySecretEncrypted: {
      type: String,
      default: "",
      select: false,
    },

    razorpayWebhookSecretEncrypted: {
      type: String,
      default: "",
      select: false,
    },

    shopOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    staff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    printers: [
      {
        name: {
          type: String,
          default: "",
          trim: true,
        },

        ip: {
          type: String,
          default: "",
          trim: true,
        },

        status: {
          type: String,
          default: "Online",
        },
      },
    ],

    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically generate a unique code for new shops
// and for old shops that are saved without one.
shopSchema.pre("validate", async function () {
  if (this.shopCode) {
    this.shopCode = this.shopCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");

    if (!this.shopCode) {
      throw new Error("Shop code is invalid");
    }

    return;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateShopCode();

    const existingShop = await this.constructor.exists({
      shopCode: candidate,
      _id: {
        $ne: this._id,
      },
    });

    if (!existingShop) {
      this.shopCode = candidate;
      return;
    }
  }

  throw new Error("Unable to generate a unique shop code");
});

const removePaymentSecrets = (_document, returnedObject) => {
  delete returnedObject.razorpayKeySecret;
  delete returnedObject.razorpayKeySecretEncrypted;
  delete returnedObject.razorpayWebhookSecretEncrypted;

  return returnedObject;
};

shopSchema.set("toJSON", {
  transform: removePaymentSecrets,
});

shopSchema.set("toObject", {
  transform: removePaymentSecrets,
});

module.exports = mongoose.model("Shop", shopSchema);
