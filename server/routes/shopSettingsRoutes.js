const express = require("express");
const {
  getScopedShopSettings,
  getShopSettings,
  updateScopedShopSettings,
  updateShopSettings,
} = require("../controllers/shopSettingsController");

const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Get Shop Settings
router.get("/", protect, adminOnly, getShopSettings);

// Update Shop Settings (Admin Only)
router.put("/", protect, adminOnly, updateShopSettings);

// Per-shop pricing/settings. Admins may manage any shop; a shop owner may
// manage only the shop attached to their authenticated account.
router.get("/:shopId", protect, getScopedShopSettings);
router.put("/:shopId", protect, updateScopedShopSettings);

module.exports = router;
