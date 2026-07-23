const ShopSettings = require("../models/ShopSettings");

// ===============================
// Get Shop Settings
// ===============================
const getShopSettings = async (req, res) => {
  try {
    let settings = await ShopSettings.findOne();

    // Create default settings if none exist
    if (!settings) {
      settings = await ShopSettings.create({});
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch shop settings",
    });
  }
};

// ===============================
// Update Shop Settings
// ===============================
const updateShopSettings = async (req, res) => {
  try {
    const allowed = [
      "shopName", "logo", "phone", "email", "address", "website",
      "blackWhitePrice", "colorPrice", "a3Price", "gst", "currency",
      "openingTime", "closingTime",
    ];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    let settings = await ShopSettings.findOne();

    if (!settings) {
      settings = await ShopSettings.create(updates);
    } else {
      settings = await ShopSettings.findByIdAndUpdate(
        settings._id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      );
    }

    res.json({
      success: true,
      message: "Shop settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Settings update error:", error.message);

    res.status(error.name === "ValidationError" ? 400 : 500).json({
      success: false,
      message: error.name === "ValidationError" ? error.message : "Unable to update shop settings",
    });
  }
};

module.exports = {
  getShopSettings,
  updateShopSettings,
};
