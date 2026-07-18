const User = require("../models/User");

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

    res.json(staff);
  } catch (error) {
    console.log(error);

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

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const staff = await User.create({
      fullName,
      email,
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

    res.status(201).json({
      success: true,
      message: "Staff created successfully",
      staff: populatedStaff,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to create staff",
    });
  }
};

// ======================================
// Update Staff
// ======================================
exports.updateStaff = async (req, res) => {
  try {
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
      staff.fullName = fullName;
    }

    if (email !== undefined) {
      staff.email = email;
    }

    if (shopId !== undefined) {
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

    const updatedStaff = await User.findById(staff._id)
      .select("-password")
      .populate("shopId", "shopName");

    res.json({
      success: true,
      message: "Staff updated successfully",
      staff: updatedStaff,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to update staff",
    });
  }
};

// ======================================
// Delete Staff
// ======================================
exports.deleteStaff = async (req, res) => {
  try {
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

    await staff.deleteOne();

    res.json({
      success: true,
      message: "Staff deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Unable to delete staff",
    });
  }
};