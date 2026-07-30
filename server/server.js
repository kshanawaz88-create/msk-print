require("dotenv").config();

const http = require("node:http");
const mongoose = require("mongoose");

const { createApp, getAllowedOrigins } = require("./app");
const connectDB = require("./config/db");
const { initializeSocket, closeSocket } = require("./socket");
const {
  assertShopPaymentEncryptionConfigured,
} = require("./utils/shopPaymentEncryption");

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const validateEnvironment = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET must be configured with at least 16 characters");
  }

  assertShopPaymentEncryptionConfigured();

  if (process.env.NODE_ENV === "production") {
    if (!process.env.CLIENT_URL) {
      throw new Error("CLIENT_URL must be configured in production");
    }

    const insecureOrigins = getAllowedOrigins().filter(
      (origin) => !origin.startsWith("https://")
    );

    if (
      insecureOrigins.length &&
      process.env.ALLOW_INSECURE_CLIENT_URL !== "true"
    ) {
      throw new Error(
        "Production CLIENT_URL values must use HTTPS " +
          "(or explicitly set ALLOW_INSECURE_CLIENT_URL=true)"
      );
    }
  }

  if (
    process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED &&
    !["true", "false"].includes(
      process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED
    )
  ) {
    throw new Error(
      "RAZORPAY_PLATFORM_FALLBACK_ENABLED must be true or false"
    );
  }

  if (
    process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED === "true" &&
    (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
  ) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required " +
        "when platform fallback is enabled"
    );
  }
};

const startServer = async () => {
  validateEnvironment();

  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  initializeSocket(httpServer, getAllowedOrigins());

  await new Promise((resolve, reject) => {
    const handleStartupError = (error) => {
      reject(error);
    };

    httpServer.once("error", handleStartupError);

    httpServer.listen(PORT, HOST, () => {
      httpServer.off("error", handleStartupError);

      console.log("====================================");
      console.log("✅ Server started successfully");
      console.log(`🏠 Local API   : http://localhost:${PORT}`);
      console.log(`🌐 Network API : http://192.168.1.10:${PORT}`);
      console.log(`🔌 Listening on: ${HOST}:${PORT}`);
      console.log("====================================");

      resolve();
    });
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(`${signal} received; shutting down`);

    const forceTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);

    forceTimer.unref();

    try {
      await closeSocket();

      await new Promise((resolve) => {
        httpServer.close(resolve);
      });

      await mongoose.connection.close();

      clearTimeout(forceTimer);

      console.log("Server shut down successfully");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return {
    app,
    httpServer,
    shutdown,
  };
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  validateEnvironment,
};
