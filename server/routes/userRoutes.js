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
const { validateStaff } = require("../middleware/validate");

router.get(
  "/staff",
  protect,
  (req, res, next) => {
    if (["admin", "shopOwner"].includes(req.user.role)) return next();
    return res.status(403).json({ success: false, message: "Access denied" });
  },
  getStaff
);

router.post(
  "/staff",
  protect,
  adminOnly,
  validateStaff(true),
  createStaff
);

router.put(
  "/staff/:id",
  protect,
  adminOnly,
  validateStaff(false),
  updateStaff
);

router.delete(
  "/staff/:id",
  protect,
  adminOnly,
  deleteStaff
);

module.exports = router;
