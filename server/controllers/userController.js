const User = require("../models/User");
const Shop = require("../models/Shop");
const mongoose = require("mongoose");
const PrintJob = require("../models/printJob");

// ======================================
// Get All Staff
// ======================================
exports.getStaff = async (req, res) => {
  try {
    const query = { role: "staff" };

    if (req.user.role === "shopOwner") {
      query.shopId = req.user.shopId;
    }

    const staff = await User.find(query)
      .select("-password")
      .populate("shopId", "shopName")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: staff.length, staff });
  } catch (error) {
    console.error("Staff list failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch staff",
    });
  }
};

// ======================================
// Create Staff
// ======================================
exports.createStaff = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      shopId,
      assignedPrinter,
      employeeId,
      isAvailable,
    } = req.body;

    if (!fullName || !email || !password || !shopId) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and shop are required",
      });
    }
    if (!mongoose.isValidObjectId(shopId)) {
      return res.status(400).json({ success: false, message: "Invalid shop ID" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must contain at least 6 characters" });
    }
    if (!(await Shop.exists({ _id: shopId }))) {
      return res.status(400).json({ success: false, message: "Selected shop does not exist" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const staff = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      role: "staff",
      shopId,
      assignedPrinter: assignedPrinter || "",
      employeeId: employeeId || undefined,
      isAvailable:
        typeof isAvailable === "boolean"
          ? isAvailable
          : true,
    });

    const populatedStaff = await User.findById(staff._id)
      .select("-password")
      .populate("shopId", "shopName");

    await Shop.findByIdAndUpdate(shopId, { $addToSet: { staff: staff._id } });

    res.status(201).json({
      success: true,
      message: "Staff created successfully",
      staff: populatedStaff,
    });
  } catch (error) {
    console.error("Staff creation failed:", error.message);

    res.status(error?.code === 11000 ? 409 : 500).json({
      success: false,
      message: error?.code === 11000
        ? "Staff email or employee ID already exists"
        : "Unable to create staff",
    });
  }
};

// ======================================
// Update Staff
// ======================================
exports.updateStaff = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid staff ID" });
    }
    const staff = await User.findOne({
      _id: req.params.id,
      role: "staff",
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    const {
      fullName,
      email,
      password,
      shopId,
      assignedPrinter,
      employeeId,
      isAvailable,
    } = req.body;

    if (email && email.toLowerCase() !== staff.email) {
      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: staff._id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    if (fullName !== undefined) {
      staff.fullName = fullName.trim();
    }

    if (email !== undefined) {
      staff.email = email.trim().toLowerCase();
    }

    let oldShopId;
    if (shopId !== undefined) {
      if (shopId && !mongoose.isValidObjectId(shopId)) {
        return res.status(400).json({ success: false, message: "Invalid shop ID" });
      }
      if (shopId && !(await Shop.exists({ _id: shopId }))) {
        return res.status(400).json({ success: false, message: "Selected shop does not exist" });
      }
      oldShopId = staff.shopId;
      staff.shopId = shopId || null;
    }

    if (assignedPrinter !== undefined) {
      staff.assignedPrinter = assignedPrinter;
    }

    if (employeeId !== undefined) {
      staff.employeeId = employeeId || undefined;
    }

    if (typeof isAvailable === "boolean") {
      staff.isAvailable = isAvailable;
    }

    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must contain at least 6 characters",
        });
      }

      staff.password = password;
    }

    await staff.save();

    if (shopId !== undefined && oldShopId?.toString() !== shopId) {
      await Shop.updateMany({ staff: staff._id }, { $pull: { staff: staff._id } });
      if (shopId) await Shop.findByIdAndUpdate(shopId, { $addToSet: { staff: staff._id } });
    }

    const updatedStaff = await User.findById(staff._id)
      .select("-password")
      .populate("shopId", "shopName");

    res.json({
      success: true,
      message: "Staff updated successfully",
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("Staff update failed:", error.message);

    res.status(error?.code === 11000 ? 409 : 500).json({
      success: false,
      message: error?.code === 11000
        ? "Staff email or employee ID already exists"
        : "Unable to update staff",
    });
  }
};

// ======================================
// Delete Staff
// ======================================
exports.deleteStaff = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid staff ID" });
    }
    const staff = await User.findOne({
      _id: req.params.id,
      role: "staff",
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    await Shop.updateMany({ staff: staff._id }, { $pull: { staff: staff._id } });
    await PrintJob.updateMany({ assignedStaff: staff._id }, { $set: { assignedStaff: null } });
    await staff.deleteOne();

    res.json({
      success: true,
      message: "Staff deleted successfully",
    });
  } catch (error) {
    console.error("Staff deletion failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to delete staff",
    });
  }
};
