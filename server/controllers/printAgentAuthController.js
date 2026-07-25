const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Shop = require("../models/Shop");
const User = require("../models/User");

const AGENT_AUDIENCE = "msk-print-agent";
const AGENT_ISSUER = "msk-print-cloud";
const ALLOWED_ROLES = ["admin", "shopOwner"];

const roleMessage =
  "Only administrators, shop owners, or authorized staff can use the Print Agent.";

const findActiveShop = (identifier) => {
  const value = typeof identifier === "string" ? identifier.trim() : "";
  if (!value) return null;
  const identifiers = [{ shopCode: value.toUpperCase() }];
  if (mongoose.isValidObjectId(value)) identifiers.push({ _id: value });
  return Shop.findOne({ isActive: true, $or: identifiers })
    .select("_id shopName shopCode");
};

const activeShopChoices = async () => {
  const shops = await Shop.find({ isActive: true })
    .select("_id shopName shopCode")
    .sort({ shopName: 1, _id: 1 });
  return shops.map((shop) => ({
    id: shop._id,
    shopName: shop.shopName,
    shopCode: shop.shopCode || "",
  }));
};

const resolveAgentShop = async (user, requestedShop) => {
  if (user.role === "shopOwner") {
    if (!user.shopId) {
      const error = new Error("Your account is not assigned to a shop");
      error.status = 403;
      throw error;
    }
    const shop = await findActiveShop(user.shopId.toString());
    if (!shop) {
      const error = new Error("Your assigned shop is unavailable or inactive");
      error.status = 403;
      throw error;
    }
    if (
      requestedShop &&
      requestedShop !== shop._id.toString() &&
      requestedShop.toUpperCase() !== String(shop.shopCode || "").toUpperCase()
    ) {
      const error = new Error("Shop owners can only connect their assigned shop");
      error.status = 403;
      throw error;
    }
    return shop;
  }

  if (requestedShop) {
    const shop = await findActiveShop(requestedShop);
    if (!shop) {
      const error = new Error("The selected shop is unavailable or inactive");
      error.status = 404;
      throw error;
    }
    return shop;
  }

  const shops = await activeShopChoices();
  if (shops.length === 0) {
    const error = new Error("No active shop is available. Create or activate a shop first.");
    error.status = 409;
    throw error;
  }
  if (shops.length > 1) {
    const error = new Error("Select a shop to continue");
    error.status = 409;
    error.code = "SHOP_SELECTION_REQUIRED";
    error.shops = shops;
    throw error;
  }
  return Shop.findById(shops[0].id).select("_id shopName shopCode");
};

const issueAgentSession = (user, shop) => {
  const sessionId = crypto.randomUUID();
  const token = jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      shopId: shop._id.toString(),
      scope: "print-agent",
    },
    process.env.JWT_SECRET,
    {
      audience: AGENT_AUDIENCE,
      issuer: AGENT_ISSUER,
      jwtid: sessionId,
      expiresIn: process.env.PRINT_AGENT_TOKEN_TTL || "7d",
    }
  );
  return {
    success: true,
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      shopId: shop._id,
    },
    shop: {
      id: shop._id,
      shopName: shop.shopName,
      shopCode: shop.shopCode || "",
    },
  };
};

const sendAgentError = (res, error, fallback) => res
  .status(error.status || 500)
  .json({
    success: false,
    code: error.code,
    message: error.message || fallback,
    ...(error.shops ? { shops: error.shops } : {}),
  });

// Compatibility endpoint for installed agents built before the normal-login
// exchange flow. New agents use /api/auth/login followed by /api/agent/session.
const loginPrintAgent = async (req, res) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = req.body.password;
    if (!email || typeof password !== "string" || password.length < 6 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    // Keep the legacy endpoint's generic rejection to avoid account-role probing.
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const requestedShop = typeof req.body.shopId === "string"
      ? req.body.shopId.trim()
      : "";
    const shop = await resolveAgentShop(user, requestedShop);
    user.lastLogin = new Date();
    await user.save();
    return res.json(issueAgentSession(user, shop));
  } catch (error) {
    if (error.status) return sendAgentError(res, error, "Unable to log in to the print agent");
    console.error("Print agent login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to log in to the print agent",
    });
  }
};

const createPrintAgentSession = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("fullName email role shopId isAvailable");
    if (!user) {
      return res.status(401).json({ success: false, message: "Account no longer exists" });
    }
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, message: roleMessage });
    }
    const requestedShop = typeof req.body.shopId === "string"
      ? req.body.shopId.trim()
      : "";
    const shop = await resolveAgentShop(user, requestedShop);
    return res.json(issueAgentSession(user, shop));
  } catch (error) {
    if (error.status) return sendAgentError(res, error, "Unable to start the print agent session");
    console.error("Print agent session error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to start the print agent session",
    });
  }
};

module.exports = {
  AGENT_AUDIENCE,
  AGENT_ISSUER,
  createPrintAgentSession,
  loginPrintAgent,
};
