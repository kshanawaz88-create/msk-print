const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token = req.headers.authorization;
  const authDebug = process.env.NODE_ENV !== "production" &&
    process.env.AUTH_DEBUG === "true";
  if (authDebug) {
    console.debug("Authentication request:", {
      authorizationHeaderExists: Boolean(token),
      method: req.method,
      path: req.originalUrl,
    });
  }

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  token = token.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope && decoded.scope !== "web") {
      return res.status(401).json({
        success: false,
        message: "This token cannot access the web API. Please log in again",
      });
    }
    if (authDebug) {
      console.debug("JWT verification succeeded:", {
        userIdPresent: Boolean(decoded.id || decoded.userId),
      });
    }
  } catch (error) {
    if (authDebug) {
      console.warn("JWT verification rejected:", error.message);
    }
    return res.status(401).json({
      success: false,
      message: error.name === "TokenExpiredError"
        ? "Session expired. Please log in again"
        : "Invalid authentication token. Please log in again",
    });
  }

  try {
    const userId = decoded.id || decoded.userId;
    if (!mongoose.isValidObjectId(userId)) {
      if (authDebug) {
        console.warn("JWT verification rejected: payload has no valid user ID");
      }
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token. Please log in again",
      });
    }

    const user = await User.findById(userId).select("role shopId isAvailable");
    if (!user) {
      return res.status(401).json({ success: false, message: "Account no longer exists" });
    }
    if (user.role === "staff" && user.isAvailable === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Staff account is inactive",
      });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      shopId: user.shopId || null,
    };

    next();

  } catch (error) {
    console.error("Authentication lookup error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to authenticate request",
    });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role === "admin") {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Admin access only",
  });
};

const shopOwnerOnly = (req, res, next) => {
  if (
    req.user.role === "shopOwner" ||
    req.user.role === "admin"
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Shop Owner access only",
  });
};

const staffOnly = (req, res, next) => {
  if (
    req.user.role === "staff" ||
    req.user.role === "admin"
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Staff access only",
  });
};

module.exports = {
  protect,
  adminOnly,
  shopOwnerOnly,
  staffOnly,
};
