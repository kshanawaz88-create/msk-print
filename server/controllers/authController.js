const User = require("../models/User");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

// ===============================
// Register User
// ===============================
const registerUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      role,
      shopId,
    } = req.body;

    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
      fullName,
      email,
      password,

      role: role || "customer",

      shopId: shopId || null,
    });

    await sendEmail(
      user.email,
      "Welcome to MSK Print Cloud",
      `Hello ${user.fullName},

Welcome to MSK Print Cloud!

Your account has been created successfully.

Role: ${user.role}

You can now login and start using the platform.

Regards,
MSK Print Cloud Team`
    );

  const token = jwt.sign(
  {
    id: user._id,
    role: user.role,
    shopId: user.shopId,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: "7d",
  }
);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        shopId: user.shopId,
      },
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ===============================
// Login User
// ===============================
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("================================");
    console.log("Login Attempt");
    console.log("Email:", email);

    const user = await User.findOne({ email }).populate("shopId");

    console.log("User Found:", user);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log("Stored Hash:", user.password);

    const isMatch = await user.comparePassword(password);

    console.log("Password Match:", isMatch);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

   const token = jwt.sign(
  {
    id: user._id,
    role: user.role,
    shopId: user.shopId ? user.shopId._id : null,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: "7d",
  }
);
    res.json({
      success: true,
      message: "Login successful",
      token,
     user: {
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  shopId: user.shopId,
  assignedPrinter: user.assignedPrinter,
  employeeId: user.employeeId,
},
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
};