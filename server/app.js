const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { apiLimiter } = require("./middleware/rateLimits");
const { notFound, errorHandler } = require("./middleware/errors");

const createApp = () => {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed by CORS");
      error.status = 403;
      return callback(error);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Razorpay-Signature",
      "X-Print-Claim",
    ],
    credentials: false,
    maxAge: 600,
  }));

  app.use(
    "/api/payment/webhook",
    express.raw({ type: "application/json", limit: process.env.WEBHOOK_BODY_LIMIT || "256kb" }),
    require("./routes/webhookRoutes")
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "100kb" }));
  app.use("/api", apiLimiter);

  // Keep the agent queue mounted before the generic /api/print/:id routes.
  app.use("/api/agent", require("./routes/printAgentAuthRoutes"));
  app.use("/api/print/queue", require("./routes/printAgentQueueRoutes"));
  app.use("/api/print", require("./routes/printRoutes"));
  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/payment", require("./routes/paymentRoutes"));
  app.use("/api/invoices", require("./routes/invoiceRoutes"));
  app.use("/api/settings", require("./routes/shopSettingsRoutes"));
  app.use("/api/shops", require("./routes/shopRoutes"));
  app.use("/api/users", require("./routes/userRoutes"));

  app.get("/api/test", (_req, res) => {
    res.json({ success: true, message: "Backend connected successfully" });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };
