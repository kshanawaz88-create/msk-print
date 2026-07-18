const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const {
  protect,
  adminOnly,
} = require("../middleware/auth");

const {
  registerUser,
  loginUser,
} = require("../controllers/authController");

const router = express.Router();

// ==========================================
// Register & Login
// ==========================================

router.post("/register", registerUser);
router.post("/login", loginUser);

// ==========================================
// Create Staff (Admin Only)
// ==========================================

router.post(
  "/create-staff",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const {
        fullName,
        email,
        password,
        shop,
        printerName,
      } = req.body;

      console.log("Incoming Staff Data:", req.body);

      const existing = await User.findOne({
        email,
      });

      if (existing) {
        return res.status(400).json({
          message: "Email already exists",
        });
      }

      const staff = await User.create({
        fullName,
        email,
        password,
        role: "staff",

        shopId: shop,
        assignedPrinter: printerName,
      });

      res.status(201).json({
        success: true,
        message: "Staff created successfully",
        staff,
      });

    } catch (err) {
      console.log(err);

      res.status(500).json({
        success: false,
        message: "Unable to create staff",
      });
    }
  }
);

module.exports = router;