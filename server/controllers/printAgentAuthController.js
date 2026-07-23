const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const Shop = require("../models/Shop");
const User = require("../models/User");

const AGENT_AUDIENCE = "msk-print-agent";
const AGENT_ISSUER = "msk-print-cloud";

const loginPrintAgent = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password = req.body.password;

    if (
      !email ||
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    const passwordMatches = user
      ? await user.comparePassword(password)
      : false;

    if (!user || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const allowedRoles = [
      "admin",
      "shopOwner",
      "staff",
    ];

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Only administrators, shop owners, or authorized staff can use the Print Agent",
      });
    }

    if (
      user.role === "staff" &&
      user.isAvailable === false
    ) {
      return res.status(403).json({
        success: false,
        message: "This staff account is inactive",
      });
    }

    let shop = null;

    if (
      user.role === "shopOwner" ||
      user.role === "staff"
    ) {
      if (!user.shopId) {
        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a shop",
        });
      }

      shop = await Shop.findOne({
        _id: user.shopId,
        isActive: true,
      });

      if (!shop) {
        return res.status(403).json({
          success: false,
          message:
            "Your assigned shop is unavailable or inactive",
        });
      }
    }

    if (user.role === "admin") {
      const activeShops = await Shop.find({
        isActive: true,
      })
        .select("_id shopName shopCode")
        .sort({ shopName: 1 });

      if (activeShops.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No active shop is available. Create or activate a shop first.",
        });
      }

      /*
        Temporary admin behavior:
        automatically select the only shop.

        If there are multiple shops, return the list so the
        Print Agent can add a shop-selection screen next.
      */
      if (activeShops.length === 1) {
        shop = activeShops[0];
      } else {
        return res.status(409).json({
          success: false,
          code: "SHOP_SELECTION_REQUIRED",
          message: "Select a shop to continue",
          shops: activeShops.map((item) => ({
            id: item._id,
            shopName: item.shopName,
            shopCode: item.shopCode || "",
          })),
        });
      }
    }

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
        expiresIn:
          process.env.PRINT_AGENT_TOKEN_TTL || "7d",
      }
    );

    user.lastLogin = new Date();
    await user.save();

    return res.json({
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
    });
  } catch (error) {
    console.error(
      "Print agent login error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to log in to the print agent",
    });
  }
};

module.exports = {
  AGENT_AUDIENCE,
  AGENT_ISSUER,
  loginPrintAgent,
};