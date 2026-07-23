const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

const configurationError = () => new Error(
  "SHOP_PAYMENT_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hexadecimal characters or valid base64"
);

const decodeEncryptionKey = (encoded = process.env.SHOP_PAYMENT_ENCRYPTION_KEY) => {
  const value = typeof encoded === "string" ? encoded.trim() : "";
  if (!value) throw configurationError();

  let key;
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    if (
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(value) ||
      value.length % 4 === 1
    ) throw configurationError();
    key = Buffer.from(value, "base64");
    const canonicalInput = value.replace(/=+$/, "");
    const canonicalDecoded = key.toString("base64").replace(/=+$/, "");
    if (canonicalInput !== canonicalDecoded) throw configurationError();
  }

  if (key.length !== 32) throw configurationError();
  return key;
};

const encodePart = (value) => value.toString("base64url");
const decodePart = (value) => Buffer.from(value, "base64url");

const validateContext = (context) => {
  if (typeof context !== "string" || !context.trim()) {
    throw new Error("A shop payment encryption context is required");
  }
  return Buffer.from(context.trim(), "utf8");
};

const encryptShopSecret = (plaintext, context) => {
  if (typeof plaintext !== "string" || !plaintext.trim()) {
    throw new Error("A non-empty payment secret is required");
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, decodeEncryptionKey(), iv);
  cipher.setAAD(validateContext(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext.trim(), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    encodePart(iv),
    encodePart(tag),
    encodePart(ciphertext),
  ].join(".");
};

const decryptShopSecret = (encrypted, context) => {
  if (typeof encrypted !== "string" || !encrypted) {
    throw new Error("The shop payment secret is not configured");
  }

  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("The stored shop payment secret has an unsupported format");
  }

  try {
    const iv = decodePart(parts[1]);
    const tag = decodePart(parts[2]);
    const ciphertext = decodePart(parts[3]);
    if (iv.length !== IV_BYTES || tag.length !== 16 || !ciphertext.length) {
      throw new Error("invalid encrypted value");
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, decodeEncryptionKey(), iv);
    decipher.setAAD(validateContext(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error.message.startsWith("SHOP_PAYMENT_ENCRYPTION_KEY")) throw error;
    throw new Error("Unable to decrypt the shop payment secret; verify SHOP_PAYMENT_ENCRYPTION_KEY");
  }
};

const assertShopPaymentEncryptionConfigured = () => {
  decodeEncryptionKey();
};

module.exports = {
  assertShopPaymentEncryptionConfigured,
  decodeEncryptionKey,
  encryptShopSecret,
  decryptShopSecret,
};
