const fs = require("node:fs");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const axios = require("axios");

const cloudinary = require("../config/cloudinary");

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const fileError = (message, status = 404) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const safeFilename = (value) => {
  const cleaned = path.basename(value || "print-file")
    .replace(/[\r\n"]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim();
  return cleaned || "print-file";
};

const inferMimeType = (job) =>
  job.fileMimeType ||
  MIME_TYPES[path.extname(job.fileName || "").toLowerCase()] ||
  "application/octet-stream";

const cloudinarySourceFromLegacyUrl = (value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
    throw fileError("Legacy print file location is not trusted", 409);
  }

  const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== process.env.CLOUDINARY_CLOUD_NAME) {
    throw fileError("Legacy print file belongs to a different Cloudinary account", 409);
  }
  const resourceIndex = parts.indexOf("raw");
  if (resourceIndex < 0 || parts.length < resourceIndex + 4) {
    throw fileError("Legacy Cloudinary file path is invalid", 409);
  }
  const deliveryType = parts[resourceIndex + 1];
  if (!["upload", "private", "authenticated"].includes(deliveryType)) {
    throw fileError("Legacy Cloudinary delivery type is not supported", 409);
  }
  let publicParts = parts.slice(resourceIndex + 2);
  if (/^v\d+$/.test(publicParts[0])) publicParts = publicParts.slice(1);
  const publicId = publicParts.join("/");
  if (!publicId || publicParts.some((part) => part === "..")) {
    throw fileError("Legacy Cloudinary public ID is invalid", 409);
  }
  return { publicId, deliveryType, resourceType: "raw" };
};

const localSourceFromLegacyPath = (value) => {
  if (!value || /^https?:/i.test(value)) return null;
  const uploadsRoot = path.resolve(__dirname, "..", "uploads");
  const resolved = path.resolve(uploadsRoot, value.replace(/^uploads[\\/]/i, ""));
  if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw fileError("Legacy print file path is invalid", 409);
  }
  return resolved;
};

const resolveSource = (job) => {
  if (job.cloudinaryPublicId) {
    return {
      publicId: job.cloudinaryPublicId,
      deliveryType: job.cloudinaryDeliveryType || "upload",
      resourceType: "raw",
    };
  }
  const storedLocation = job.fileUrl || job.filePath || "";
  return cloudinarySourceFromLegacyUrl(storedLocation) ||
    localSourceFromLegacyPath(storedLocation);
};

const applyDownloadHeaders = (res, job, contentLength) => {
  const filename = safeFilename(job.fileName);
  res.set({
    "Cache-Control": "no-store, private",
    "Content-Type": inferMimeType(job),
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
  });
  if (contentLength) res.set("Content-Length", contentLength);
};

class VerifiedFileStream extends Transform {
  constructor(expectedSize = 0) {
    super();
    this.bytes = 0;
    this.expectedSize = Number.isFinite(expectedSize) && expectedSize > 0
      ? expectedSize
      : 0;
  }

  _transform(chunk, encoding, callback) {
    this.bytes += chunk.length;
    if (this.bytes > MAX_FILE_BYTES) {
      return callback(fileError("The print file exceeds the download limit", 409));
    }
    return callback(null, chunk);
  }

  _flush(callback) {
    if (this.bytes === 0) {
      return callback(fileError("The stored print file is empty", 502));
    }
    if (this.expectedSize && this.bytes !== this.expectedSize) {
      return callback(fileError("The stored print file size does not match the order", 502));
    }
    return callback();
  }
}

const streamPrintFile = async (job, res) => {
  const source = resolveSource(job);
  if (!source) throw fileError("The original print file is unavailable");

  if (typeof source === "string") {
    let stat;
    try {
      stat = await fs.promises.stat(source);
    } catch {
      throw fileError("The original print file is unavailable");
    }
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) {
      throw fileError("The original print file is invalid", 409);
    }
    applyDownloadHeaders(res, job, stat.size);
    await pipeline(fs.createReadStream(source), res);
    return;
  }

  const signedUrl = cloudinary.utils.private_download_url(
    source.publicId,
    "",
    {
      resource_type: source.resourceType,
      type: source.deliveryType,
      attachment: false,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    }
  );
  let upstream;
  try {
    upstream = await axios.get(signedUrl, {
      responseType: "stream",
      timeout: Number(process.env.PRINT_AGENT_DOWNLOAD_TIMEOUT_MS || 30000),
      maxRedirects: 0,
      maxContentLength: MAX_FILE_BYTES,
      validateStatus: (status) => status === 200,
    });
  } catch (error) {
    throw fileError(
      error.code === "ECONNABORTED"
        ? "Timed out downloading the print file"
        : "Unable to download the print file from storage",
      502
    );
  }

  const length = Number(upstream.headers["content-length"]);
  if (Number.isFinite(length) && (length <= 0 || length > MAX_FILE_BYTES)) {
    upstream.data.destroy();
    throw fileError(
      length <= 0 ? "The stored print file is empty" : "The print file exceeds the download limit",
      length <= 0 ? 502 : 409
    );
  }
  const storedSize = Number(job.fileSize);
  if (
    Number.isFinite(length) &&
    Number.isFinite(storedSize) &&
    storedSize > 0 &&
    length !== storedSize
  ) {
    upstream.data.destroy();
    throw fileError("The stored print file size does not match the order", 502);
  }
  applyDownloadHeaders(
    res,
    job,
    Number.isFinite(length) && length > 0 ? length : undefined
  );
  await pipeline(
    upstream.data,
    new VerifiedFileStream(Number.isFinite(storedSize) ? storedSize : 0),
    res
  );
};

module.exports = {
  cloudinarySourceFromLegacyUrl,
  resolveSource,
  safeFilename,
  streamPrintFile,
};
