const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not configured");
    }

    const serverSelectionTimeoutMS = Number(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000
    );

    if (
      !Number.isFinite(serverSelectionTimeoutMS) ||
      serverSelectionTimeoutMS < 1000
    ) {
      throw new Error(
        "MONGODB_SERVER_SELECTION_TIMEOUT_MS must be at least 1000"
      );
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS,
    });

    console.log("====================================");
    console.log("✅ MongoDB Connected Successfully");
    console.log("📂 Database Name :", mongoose.connection.name);
    console.log("🌐 Host          :", mongoose.connection.host);
    console.log("====================================");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed");
    console.error(error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
