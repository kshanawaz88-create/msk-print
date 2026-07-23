const express = require("express");

const {
  loginPrintAgent,
} = require("../controllers/printAgentAuthController");
const { authLimiter } = require("../middleware/rateLimits");

const router = express.Router();

router.post("/login", authLimiter, loginPrintAgent);

module.exports = router;
