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

    res.json(settings);
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
    let settings = await ShopSettings.findOne();

    if (!settings) {
      settings = await ShopSettings.create(req.body);
    } else {
      settings = await ShopSettings.findByIdAndUpdate(
        settings._id,
        req.body,
        {
          new: true,
        }
      );
    }

    res.json({
      success: true,
      message: "Shop settings updated successfully",
      settings,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to update shop settings",
    });
  }
};

module.exports = {
  getShopSettings,
  updateShopSettings,
};