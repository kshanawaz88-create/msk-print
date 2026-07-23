require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const PrintJob = require("../models/printJob");

const assertNoDuplicates = async (field, groupId) => {
  const duplicates = await PrintJob.aggregate([
    {
      $match: {
        [field]: { $type: "string", $gt: "" },
      },
    },
    {
      $group: {
        _id: groupId,
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicates.length) {
    throw new Error(
      `Cannot create payment indexes because duplicate non-empty ${field} values exist`
    );
  }
};

const run = async () => {
  if (process.env.CONFIRM_PAYMENT_INDEX_MIGRATION !== "yes") {
    throw new Error(
      "Index migration not confirmed. Set CONFIRM_PAYMENT_INDEX_MIGRATION=yes only after taking a database backup"
    );
  }
  await connectDB();

  await assertNoDuplicates("upiReference", { $toUpper: "$upiReference" });
  await assertNoDuplicates("razorpayOrderId", {
    shopId: "$shopId",
    orderId: "$razorpayOrderId",
  });

  const collection = PrintJob.collection;
  await collection.createIndex(
    { upiReference: 1 },
    {
      name: "upiReference_unique_nonempty",
      unique: true,
      partialFilterExpression: {
        upiReference: { $type: "string", $gt: "" },
      },
      collation: { locale: "en", strength: 2 },
    }
  );
  await collection.createIndex(
    { shopId: 1, razorpayOrderId: 1 },
    {
      name: "shopId_razorpayOrderId_unique_nonempty",
      unique: true,
      partialFilterExpression: {
        razorpayOrderId: { $type: "string", $gt: "" },
      },
    }
  );

  console.log("Payment uniqueness indexes created successfully.");
};

run()
  .catch((error) => {
    console.error("Payment index migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
