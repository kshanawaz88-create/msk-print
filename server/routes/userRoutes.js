const express = require("express");
const router = express.Router();

const {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
} = require("../controllers/userController");

const {
  protect,
  adminOnly,
} = require("../middleware/auth");

// All routes require admin login
router.get(
  "/staff",
  protect,
  adminOnly,
  getStaff
);

router.post(
  "/staff",
  protect,
  adminOnly,
  createStaff
);

router.put(
  "/staff/:id",
  protect,
  adminOnly,
  updateStaff
);

router.delete(
  "/staff/:id",
  protect,
  adminOnly,
  deleteStaff
);

module.exports = router;