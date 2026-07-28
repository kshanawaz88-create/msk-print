require("dotenv").config();

const mongoose = require("mongoose");

const migrate = async () => {
  if (process.env.CONFIRM_INVOICE_INDEX_MIGRATION !== "yes") {
    throw new Error(
      "Index migration not confirmed. Back up MongoDB, then set CONFIRM_INVOICE_INDEX_MIGRATION=yes"
    );
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("printjobs");

  const duplicateValues = await collection.aggregate([
    {
      $match: {
        invoiceNumber: { $exists: true, $nin: ["", null] },
      },
    },
    {
      $group: {
        _id: "$invoiceNumber",
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();

  if (duplicateValues.length) {
    throw new Error(
      "Duplicate non-empty invoice numbers exist; resolve them before changing the index"
    );
  }

  const cleared = await collection.updateMany(
    { invoiceNumber: { $in: ["", null] } },
    { $unset: { invoiceNumber: "" } }
  );

  const currentIndex = (await collection.indexes())
    .find((index) => index.name === "invoiceNumber_1");
  if (currentIndex && (!currentIndex.unique || !currentIndex.sparse)) {
    await collection.dropIndex("invoiceNumber_1");
  }

  await collection.createIndex(
    { invoiceNumber: 1 },
    { unique: true, sparse: true, name: "invoiceNumber_1" }
  );

  console.log(`Invoice index repaired; cleared ${cleared.modifiedCount} empty values`);
};

migrate()
  .catch((error) => {
    console.error("Invoice index migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
