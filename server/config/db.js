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
    if (!Number.isFinite(serverSelectionTimeoutMS) || serverSelectionTimeoutMS < 1000) {
      throw new Error("MONGODB_SERVER_SELECTION_TIMEOUT_MS must be at least 1000");
    }

    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
