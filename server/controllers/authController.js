const User = require("../models/User");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

const createToken = (user) => jwt.sign(
  {
    id: user._id,
    role: user.role,
    shopId: user.shopId?._id || user.shopId || null,
    scope: "web",
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

const publicUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  shopId: user.shopId || null,
  assignedPrinter: user.assignedPrinter || "",
  employeeId: user.employeeId || null,
});

const registerUser = async (req, res) => {
  try {
    const fullName = req.body.fullName?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: "Full name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must contain at least 6 characters" });
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }

    // Public registration is always a customer account.
    const user = await User.create({ fullName, email, password, role: "customer" });
    await sendEmail(email, "Welcome to MSK Print Cloud", `Hello ${fullName},\n\nYour customer account is ready.`);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to register" });
  }
};

const loginUser = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password").populate("shopId", "shopName");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    if (user.role === "staff" && user.isAvailable === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "This staff account is inactive",
      });
    }

    user.lastLogin = new Date();
    await user.save();

    return res.json({
      success: true,
      message: "Login successful",
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to login" });
  }
};

module.exports = { registerUser, loginUser };
