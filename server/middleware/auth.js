const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  let token = req.headers.authorization;

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    token = token.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = {
      id: decoded.id,
      role: decoded.role,
      shopId: decoded.shopId || null,
    };

    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
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