const express = require("express");
const {
  getShopSettings,
  updateShopSettings,
} = require("../controllers/shopSettingsController");

const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Get Shop Settings
router.get("/", protect, adminOnly, getShopSettings);

// Update Shop Settings (Admin Only)
router.put("/", protect, adminOnly, updateShopSettings);

module.exports = router;
