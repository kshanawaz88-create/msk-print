const mongoose = require("mongoose");

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
    },

    phone: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    website: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    qrCode: {
      type: String,
      default: "",
    },

    currency: {
      type: String,
      default: "₹",
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
    },

    subscriptionPlan: {
      type: String,
      enum: ["Free", "Basic", "Pro", "Enterprise"],
      default: "Free",
    },

    maxOrdersPerMonth: {
      type: Number,
      default: 50,
    },

    themeColor: {
      type: String,
      default: "#0d6efd",
    },

    gstNumber: {
      type: String,
      default: "",
    },

    upiId: {
      type: String,
      default: "",
    },

    openingTime: {
      type: String,
      default: "09:00 AM",
    },

    closingTime: {
      type: String,
      default: "08:00 PM",
    },

    branchName: {
      type: String,
      default: "Main Branch",
    },

    city: {
      type: String,
      default: "",
    },

    state: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "India",
    },

    postalCode: {
      type: String,
      default: "",
    },

    razorpayKeyId: {
      type: String,
      default: "",
    },

    razorpayKeySecret: {
      type: String,
      default: "",
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
    name: String,
    ip: String,
    status: {
      type: String,
      default: "Online",
    },
  },
],

totalRevenue: {
  type: Number,
  default: 0,
},
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Shop", shopSchema);