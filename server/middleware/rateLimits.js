const { rateLimit } = require("express-rate-limit");

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const createLimiter = (prefix, defaults) => rateLimit({
  windowMs: numberFromEnv(`${prefix}_WINDOW_MS`, defaults.windowMs),
  limit: numberFromEnv(`${prefix}_MAX`, defaults.limit),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" || process.env.RATE_LIMIT_ENABLED === "false",
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const apiLimiter = createLimiter("RATE_LIMIT_API", { windowMs: 15 * 60 * 1000, limit: 500 });
const authLimiter = createLimiter("RATE_LIMIT_AUTH", { windowMs: 15 * 60 * 1000, limit: 20 });
const paymentLimiter = createLimiter("RATE_LIMIT_PAYMENT", { windowMs: 10 * 60 * 1000, limit: 30 });
const upiLimiter = createLimiter("RATE_LIMIT_UPI", { windowMs: 10 * 60 * 1000, limit: 15 });
const uploadLimiter = createLimiter("RATE_LIMIT_UPLOAD", { windowMs: 15 * 60 * 1000, limit: 20 });

module.exports = {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  upiLimiter,
  uploadLimiter,
};
