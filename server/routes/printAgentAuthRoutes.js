const express = require("express");

const {
  createPrintAgentSession,
  loginPrintAgent,
} = require("../controllers/printAgentAuthController");
const { authLimiter } = require("../middleware/rateLimits");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/login", authLimiter, loginPrintAgent);
router.post("/session", protect, createPrintAgentSession);

module.exports = router;
