const express = require("express");
const router = express.Router();

const {
  getAllShops,
  getShop,
  createShop,
  updateShop,
  deleteShop,
} = require("../controllers/shopController");
const {
  getPaymentSettings,
  updatePaymentSettings,
} = require("../controllers/shopPaymentController");

const {
  protect,
  adminOnly,
} = require("../middleware/auth");
const { validateShop } = require("../middleware/validate");

// View Shops (logged-in users)
router.get("/", protect, getAllShops);
router.get("/:id/payment-settings", protect, getPaymentSettings);
router.put("/:id/payment-settings", protect, updatePaymentSettings);
router.get("/:id", protect, getShop);

// Admin Only
router.post("/", protect, adminOnly, validateShop(true), createShop);
router.put("/:id", protect, adminOnly, validateShop(false), updateShop);
router.delete("/:id", protect, adminOnly, deleteShop);

module.exports = router;
