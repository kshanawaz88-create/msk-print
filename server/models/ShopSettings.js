const mongoose = require("mongoose");

const shopSettingsSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      default: "MSK Print Cloud",
    },

    logo: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
    },

    email: {
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

    blackWhitePrice: {
      type: Number,
      default: 2,
      min: 0.01,
    },

    colorPrice: {
      type: Number,
      default: 10,
      min: 0.01,
    },

    a3Price: {
      type: Number,
      default: 15,
      min: 0.01,
    },

    gst: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },

    currency: {
      type: String,
      default: "₹",
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ShopSettings", shopSettingsSchema);
