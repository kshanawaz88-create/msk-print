const express = require("express");
const { registerUser, loginUser } = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimits");
const { validateAuth } = require("../middleware/validate");

const router = express.Router();

router.post("/register", authLimiter, validateAuth(true), registerUser);
router.post("/login", authLimiter, validateAuth(false), loginUser);

module.exports = router;
