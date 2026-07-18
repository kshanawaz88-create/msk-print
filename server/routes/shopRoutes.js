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
  protect,
  adminOnly,
} = require("../middleware/auth");

// View Shops (logged-in users)
router.get("/", protect, getAllShops);
router.get("/:id", protect, getShop);

// Admin Only
router.post("/", protect, adminOnly, createShop);
router.put("/:id", protect, adminOnly, updateShop);
router.delete("/:id", protect, adminOnly, deleteShop);

module.exports = router;