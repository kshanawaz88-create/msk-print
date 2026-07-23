const express = require("express");

const {
  loginPrintAgent,
} = require("../controllers/printAgentAuthController");

const router = express.Router();

console.log("✅ agentRoutes.js loaded");

router.post("/login", (req, res, next) => {
  console.log("✅ POST /api/agent/login reached");
  next();
}, loginPrintAgent);

module.exports = router;