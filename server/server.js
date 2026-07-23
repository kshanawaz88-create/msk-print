require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const printRoutes = require("./routes/printRoutes");
const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const shopSettingsRoutes = require("./routes/shopSettingsRoutes");
const shopRoutes = require("./routes/shopRoutes");
const userRoutes = require("./routes/userRoutes");
const agentRoutes = require("./routes/agentRoutes");
const printAgentQueueRoutes = require("./routes/printAgentQueueRoutes");
const publicRoutes = require("./routes/publicRoutes");
const publicPaymentRoutes =
  require("./routes/publicPaymentRoutes");
  const http = require("http");

const {
  initializeSocket,
} = require("./socket");

const app = express();
const httpServer =
  http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://172.30.144.1:3000",
  process.env.CLIENT_URL,
].filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    // Allow tools such as Postman and same-machine server requests.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],
};

// CORS must be registered before routes.
app.use(cors(corsOptions));

// Handle browser preflight requests.
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: "2mb" }));

// Health route
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "Backend Connected Successfully!",
  });
});
// API routes

app.use("/api/print/queue", printAgentQueueRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/print", printRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/settings", shopSettingsRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/users", userRoutes);
app.use(
  "/api/public/payment",
  publicPaymentRoutes
);

// ADD THIS
app.use((req, res, next) => {
  console.log("➡️", req.method, req.originalUrl);
  next();
});

// JSON 404 response
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  if (error.message?.startsWith("Origin not allowed by CORS")) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await connectDB();

    initializeSocket(
  httpServer,
  allowedOrigins
);

httpServer.listen(PORT, () => {
      console.log(
        `🚀 Server running on http://localhost:${PORT}`
      );

      console.log(
        "✅ Allowed CORS origins:",
        allowedOrigins.join(", ")
      );
    });
  } catch (error) {
    console.error(
      "❌ Server startup failed:",
      error.message
    );

    process.exit(1);
  }
};

startServer();