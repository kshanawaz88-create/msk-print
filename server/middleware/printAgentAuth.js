const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Shop = require("../models/Shop");
const User = require("../models/User");
const {
  AGENT_AUDIENCE,
  AGENT_ISSUER,
} = require("../controllers/printAgentAuthController");

const protectPrintAgent = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Print agent authentication is required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(
      authorization.slice("Bearer ".length),
      process.env.JWT_SECRET,
      {
        audience: AGENT_AUDIENCE,
        issuer: AGENT_ISSUER,
      }
    );
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.name === "TokenExpiredError"
        ? "Print agent session expired"
        : "Invalid print agent token",
    });
  }

  if (
    decoded.scope !== "print-agent" ||
    !mongoose.isValidObjectId(decoded.id) ||
    !mongoose.isValidObjectId(decoded.shopId) ||
    !decoded.jti
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid print agent token",
    });
  }

  try {
    const [user, shop] = await Promise.all([
      User.findById(decoded.id).select("role shopId"),
      Shop.findOne({ _id: decoded.shopId, isActive: true }).select("shopName shopCode"),
    ]);
    if (
      !user ||
      !shop ||
      !["admin", "shopOwner"].includes(user.role) ||
      (
        user.role === "shopOwner" &&
        user.shopId?.toString() !== shop._id.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Print agent access is no longer authorized",
      });
    }

    req.agent = {
      userId: user._id.toString(),
      role: user.role,
      shopId: shop._id.toString(),
      sessionId: decoded.jti,
    };
    return next();
  } catch (error) {
    console.error("Print agent authentication error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to authenticate the print agent",
    });
  }
};

module.exports = { protectPrintAgent };
