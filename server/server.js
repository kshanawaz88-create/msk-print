const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const printRoutes = require("./routes/printRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/print", printRoutes);
app.use("/api/auth", authRoutes);

// Test Route
app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend Connected Successfully!",
  });
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});