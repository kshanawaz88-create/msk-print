const Shop = require("../models/Shop");
const User = require("../models/User");
const PrintJob = require("../models/printJob");
const mongoose = require("mongoose");

// ===============================
// Get All Shops
// ===============================
exports.getAllShops = async (req, res) => {
  try {
    const filters = req.user.role === "admin" || req.user.role === "customer"
      ? req.user.role === "customer" ? { isActive: true } : {}
      : { _id: req.user.shopId };
    let shopsQuery = Shop.find(filters);
    if (req.user.role === "customer") {
      shopsQuery = shopsQuery.select(
        "shopName branchName city state country isActive"
      );
    } else {
      shopsQuery = shopsQuery
        .select("-upiId -razorpayKeyId -paymentMode -paymentEnabled -paymentInstructions -qrCode")
        .populate("shopOwner", "fullName email")
        .populate("staff", "fullName email role");
    }
    const shops = await shopsQuery.sort({ createdAt: -1 });

    res.json({
      success: true,
      count: shops.length,
      shops,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch shops",
    });
  }
};

// ===============================
// Get Single Shop
// ===============================
exports.getShop = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid shop ID" });
    }

    if (
      ["shopOwner", "staff"].includes(req.user.role) &&
      req.user.shopId?.toString() !== req.params.id
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let shopQuery = Shop.findOne({
      _id: req.params.id,
      ...(req.user.role === "customer" ? { isActive: true } : {}),
    });
    if (req.user.role === "customer") {
      shopQuery = shopQuery.select(
        "shopName branchName city state country isActive"
      );
    } else {
      shopQuery = shopQuery
        .select("-upiId -razorpayKeyId -paymentMode -paymentEnabled -paymentInstructions -qrCode")
        .populate("shopOwner", "fullName email")
        .populate("staff", "fullName email role");
    }
    const shop = await shopQuery;

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.json({
      success: true,
      shop,
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
// Create Shop
// ===============================
exports.createShop = async (req, res) => {
  try {

    const {
      shopName,
      ownerName,
      email,
      phone,
      address,
      city,
      state,
      country,
      branchName,
      gstNumber,
      subscriptionPlan,
      shopOwner,
    } = req.body;

    // Validation
    if (!shopName || !ownerName || !email) {
      return res.status(400).json({
        success: false,
        message: "Shop name, owner name and email are required",
      });
    }

    // Check duplicate email
    const normalizedEmail = email.trim().toLowerCase();
    const existingShop = await Shop.findOne({ email: normalizedEmail });

    if (existingShop) {
      return res.status(400).json({
        success: false,
        message: "A shop with this email already exists",
      });
    }

    if (shopOwner && !mongoose.isValidObjectId(shopOwner)) {
      return res.status(400).json({ success: false, message: "Invalid shop owner ID" });
    }
    if (shopOwner && !(await User.exists({ _id: shopOwner }))) {
      return res.status(400).json({ success: false, message: "Shop owner account not found" });
    }

    const shopCode = `MSK${Date.now().toString().slice(-9)}`;

    // Create Shop
    const shop = await Shop.create({
      shopName,
      ownerName,
      email: normalizedEmail,
      phone,
      address,
      city,
      state,
      country,
      branchName,
      gstNumber,

      subscriptionPlan:
        subscriptionPlan || "Free",

      shopCode,

      shopOwner: shopOwner || null,
    });

    // Link owner to shop (optional)
    if (shopOwner) {
      await User.findByIdAndUpdate(shopOwner, {
        role: "shopOwner",
        shopId: shop._id,
      });
    }

    res.status(201).json({
      success: true,
      message: "Shop created successfully",
      shop,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to create shop",
    });

  }
};
// ===============================
// Update Shop
// ===============================
exports.updateShop = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid shop ID" });
    }

    const shop = await Shop.findById(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const allowed = [
      "shopName", "ownerName", "email", "phone", "address", "website",
      "city", "state", "country", "postalCode", "branchName",
      "gstNumber", "subscriptionPlan", "isActive", "themeColor",
      "openingTime", "closingTime",
    ];
    if (req.body.email) {
      const normalizedEmail = req.body.email.trim().toLowerCase();
      const duplicate = await Shop.exists({
        _id: { $ne: shop._id },
        email: normalizedEmail,
      });
      if (duplicate) {
        return res.status(409).json({ success: false, message: "A shop with this email already exists" });
      }
      req.body.email = normalizedEmail;
    }
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) shop[field] = req.body[field];
    });

    await shop.save();

    const updatedShop = await Shop.findById(shop._id)
      .populate("shopOwner", "fullName email")
      .populate("staff", "fullName email role");

    res.json({
      success: true,
      message: "Shop updated successfully",
      shop: updatedShop,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to update shop",
    });

  }
};

// ===============================
// Delete Shop
// ===============================
exports.deleteShop = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid shop ID" });
    }

    const shop = await Shop.findById(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }
    if (await PrintJob.exists({ shopId: shop._id })) {
      return res.status(409).json({
        success: false,
        message: "This shop has print orders and cannot be deleted; deactivate it instead",
      });
    }

    // Remove shop reference from users
    await User.updateMany(
      { shopId: shop._id },
      {
        $set: {
          shopId: null,
        },
      }
    );

    await shop.deleteOne();

    res.json({
      success: true,
      message: "Shop deleted successfully",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to delete shop",
    });

  }
};
