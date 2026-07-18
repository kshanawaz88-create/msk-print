const Shop = require("../models/Shop");
const User = require("../models/User");

// ===============================
// Get All Shops
// ===============================
exports.getAllShops = async (req, res) => {
  try {
    const shops = await Shop.find()
      .populate("shopOwner", "fullName email")
      .populate("staff", "fullName email role")
      .sort({ createdAt: -1 });

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

    const shop = await Shop.findById(req.params.id)
      .populate("shopOwner", "fullName email")
      .populate("staff", "fullName email role");

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
      upiId,
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
    const existingShop = await Shop.findOne({ email });

    if (existingShop) {
      return res.status(400).json({
        success: false,
        message: "A shop with this email already exists",
      });
    }

    // Generate Shop Code
    const totalShops = await Shop.countDocuments();

    const shopCode =
      "MSK" + String(totalShops + 1).padStart(4, "0");

    // Create Shop
    const shop = await Shop.create({
      shopName,
      ownerName,
      email,
      phone,
      address,
      city,
      state,
      country,
      branchName,
      upiId,
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

    const shop = await Shop.findById(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    Object.assign(shop, req.body);

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

    const shop = await Shop.findById(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
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