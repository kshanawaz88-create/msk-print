const mongoose = require("mongoose");

const Shop = require("../models/Shop");
const ShopSettings = require("../models/ShopSettings");

const DEFAULT_SETTINGS = Object.freeze({
  shopName: "MSK Print Cloud",
  logo: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  blackWhitePrice: 2,
  colorPrice: 10,
  a3Price: 15,
  gst: 18,
  currency: "\u20B9",
  openingTime: "09:00 AM",
  closingTime: "08:00 PM",
});

const STRING_LIMITS = Object.freeze({
  shopName: 120,
  logo: 500,
  phone: 30,
  email: 254,
  address: 500,
  website: 500,
  currency: 10,
  openingTime: 30,
  closingTime: 30,
});

const PRICE_FIELDS = new Set([
  "blackWhitePrice",
  "colorPrice",
  "a3Price",
]);

const inputError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const sanitizeUpdates = (body = {}) => {
  const updates = {};

  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") {
      throw inputError(`${field} must be text`);
    }
    const value = body[field].trim();
    if (value.length > limit) {
      throw inputError(`${field} cannot exceed ${limit} characters`);
    }
    updates[field] = value;
  }

  if (
    updates.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)
  ) {
    throw inputError("Email address is invalid");
  }

  for (const field of [...PRICE_FIELDS, "gst"]) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value)) {
      throw inputError(`${field} must be a number`);
    }
    if (PRICE_FIELDS.has(field) && (value <= 0 || value > 100000)) {
      throw inputError(`${field} must be greater than 0 and no more than 100000`);
    }
    if (field === "gst" && (value < 0 || value > 100)) {
      throw inputError("gst must be between 0 and 100");
    }
    updates[field] = value;
  }

  if (Object.keys(updates).length === 0) {
    throw inputError("Provide at least one supported shop setting");
  }

  return updates;
};

const normalizedShopScope = async (req) => {
  const value = req.params.shopId;
  if (!mongoose.isValidObjectId(value)) {
    const error = inputError("Invalid shop ID");
    throw error;
  }

  const shopId = value.toString();
  const isAdmin = req.user.role === "admin";
  const isOwnShop =
    req.user.role === "shopOwner" &&
    req.user.shopId?.toString() === shopId;

  if (!isAdmin && !isOwnShop) {
    const error = new Error("You cannot manage settings for this shop");
    error.status = 403;
    throw error;
  }

  if (!(await Shop.exists({ _id: shopId }))) {
    const error = new Error("Shop not found");
    error.status = 404;
    throw error;
  }

  return shopId;
};

const newestSettings = (filter) =>
  ShopSettings.findOne(filter).sort({ updatedAt: -1, _id: 1 });

const settingsResponse = (settings, { shopId = null, inherited = false } = {}) => {
  const source = settings?.toObject ? settings.toObject() : settings || {};
  const safe = { ...DEFAULT_SETTINGS, ...source };
  delete safe.settingsKey;

  if (inherited) delete safe._id;
  safe.shopId = shopId || null;
  safe.inherited = inherited;
  return safe;
};

const readSettings = async (shopId = null) => {
  if (shopId) {
    const scoped = await newestSettings({ shopId });
    if (scoped) {
      return settingsResponse(scoped, { shopId, inherited: false });
    }
  }

  const globalSettings = await newestSettings({ shopId: null });
  return settingsResponse(globalSettings, {
    shopId,
    inherited: Boolean(shopId),
  });
};

const persistSettings = async (shopId, updates) => {
  const filter = shopId ? { shopId } : { shopId: null };
  const existing = await newestSettings(filter);

  if (existing) {
    return ShopSettings.findByIdAndUpdate(existing._id, updates, {
      returnDocument: "after",
      runValidators: true,
    });
  }

  const settingsKey = shopId ? `shop:${shopId}` : "global";
  try {
    return await ShopSettings.findOneAndUpdate(
      { settingsKey },
      {
        $set: updates,
        $setOnInsert: { shopId, settingsKey },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    // A concurrent first update can win the unique-key race. Retry against
    // that one record rather than creating a duplicate singleton.
    if (error?.code !== 11000) throw error;
    return ShopSettings.findOneAndUpdate(
      { settingsKey },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );
  }
};

const sendControllerError = (res, error, operation) => {
  const status =
    error.status ||
    (error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);

  if (status >= 500 && process.env.NODE_ENV !== "production") {
    console.error(`Shop settings ${operation} failed:`, error.message);
  } else if (status >= 500) {
    console.error(`Shop settings ${operation} failed`);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? `Unable to ${operation} shop settings`
        : error.message,
  });
};

const getShopSettings = async (_req, res) => {
  try {
    return res.json({ success: true, settings: await readSettings() });
  } catch (error) {
    return sendControllerError(res, error, "fetch");
  }
};

const getScopedShopSettings = async (req, res) => {
  try {
    const shopId = await normalizedShopScope(req);
    return res.json({
      success: true,
      settings: await readSettings(shopId),
    });
  } catch (error) {
    return sendControllerError(res, error, "fetch");
  }
};

const updateShopSettings = async (req, res) => {
  try {
    const updates = sanitizeUpdates(req.body);
    const settings = await persistSettings(null, updates);
    return res.json({
      success: true,
      message: "Shop settings updated successfully",
      settings: settingsResponse(settings),
    });
  } catch (error) {
    return sendControllerError(res, error, "update");
  }
};

const updateScopedShopSettings = async (req, res) => {
  try {
    const shopId = await normalizedShopScope(req);
    const updates = sanitizeUpdates(req.body);
    const settings = await persistSettings(shopId, updates);
    return res.json({
      success: true,
      message: "Shop settings updated successfully",
      settings: settingsResponse(settings, { shopId, inherited: false }),
    });
  } catch (error) {
    return sendControllerError(res, error, "update");
  }
};

module.exports = {
  getScopedShopSettings,
  getShopSettings,
  readSettings,
  sanitizeUpdates,
  updateScopedShopSettings,
  updateShopSettings,
};
