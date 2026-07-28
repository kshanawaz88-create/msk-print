const mongoose = require("mongoose");

const shopSettingsSchema = new mongoose.Schema(
  {
    // A null scope is the legacy/global fallback. Existing records therefore
    // continue to work until a shop-specific pricing record is created.
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
      immutable: true,
    },

    // Internal idempotency key. Sparse keeps old records that predate this
    // field valid and avoids requiring a destructive data migration.
    settingsKey: {
      type: String,
      trim: true,
      immutable: true,
      select: false,
    },

    shopName: {
      type: String,
      default: "MSK Print Cloud",
      trim: true,
      maxlength: 120,
    },

    logo: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    address: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    website: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    blackWhitePrice: {
      type: Number,
      default: 2,
      min: 0.01,
      max: 100000,
    },

    colorPrice: {
      type: Number,
      default: 10,
      min: 0.01,
      max: 100000,
    },

    a3Price: {
      type: Number,
      default: 15,
      min: 0.01,
      max: 100000,
    },

    gst: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },

    currency: {
      type: String,
      default: "\u20B9",
      trim: true,
      maxlength: 10,
    },

    upiId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },

    openingTime: {
      type: String,
      default: "09:00 AM",
      trim: true,
      maxlength: 30,
    },

    closingTime: {
      type: String,
      default: "08:00 PM",
      trim: true,
      maxlength: 30,
    },
  },
  {
    timestamps: true,
  }
);

shopSettingsSchema.pre("validate", function assignSettingsKey() {
  if (this.isNew && !this.settingsKey) {
    this.settingsKey = this.shopId
      ? `shop:${this.shopId.toString()}`
      : "global";
  }
});

shopSettingsSchema.index(
  { settingsKey: 1 },
  { unique: true, sparse: true, name: "settingsKey_1" }
);
shopSettingsSchema.index({ shopId: 1 }, { name: "shopId_1" });

const removeInternalFields = (_document, returnedObject) => {
  delete returnedObject.settingsKey;
  return returnedObject;
};

shopSettingsSchema.set("toJSON", { transform: removeInternalFields });
shopSettingsSchema.set("toObject", { transform: removeInternalFields });

module.exports = mongoose.model("ShopSettings", shopSettingsSchema);
