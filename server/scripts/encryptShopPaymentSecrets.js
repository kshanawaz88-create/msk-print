require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Shop = require("../models/Shop");
const {
  assertShopPaymentEncryptionConfigured,
  decryptShopSecret,
  encryptShopSecret,
} = require("../utils/shopPaymentEncryption");

const run = async () => {
  if (process.env.CONFIRM_SHOP_PAYMENT_SECRET_MIGRATION !== "yes") {
    throw new Error(
      "Migration not confirmed. Set CONFIRM_SHOP_PAYMENT_SECRET_MIGRATION=yes only after taking a database backup"
    );
  }
  assertShopPaymentEncryptionConfigured();
  await connectDB();

  const shops = await Shop.find({
    razorpayKeySecret: { $exists: true, $nin: ["", null] },
  }).select("+razorpayKeySecret +razorpayKeySecretEncrypted");

  let migrated = 0;
  for (const shop of shops) {
    const context = `shop:${shop._id}:razorpay-key-secret`;
    let encrypted = shop.razorpayKeySecretEncrypted;
    if (encrypted) {
      decryptShopSecret(encrypted, context);
    } else {
      encrypted = encryptShopSecret(shop.razorpayKeySecret, context);
    }
    const result = await Shop.updateOne(
      {
        _id: shop._id,
        razorpayKeySecret: shop.razorpayKeySecret,
      },
      {
        $set: { razorpayKeySecretEncrypted: encrypted },
        $unset: { razorpayKeySecret: 1 },
      }
    );
    migrated += result.modifiedCount;
  }

  console.log(`Encrypted payment secrets for ${migrated} shop(s).`);
};

run()
  .catch((error) => {
    console.error("Shop payment secret migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
