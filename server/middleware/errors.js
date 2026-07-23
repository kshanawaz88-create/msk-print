const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.path}`,
  });
};

const errorHandler = (error, req, res, _next) => {
  const isMulter = error?.name === "MulterError";
  const isValidation = error?.name === "ValidationError" || error?.name === "CastError";
  const isSafeUpload = error?.message?.startsWith("Only PDF");
  const status = error.status || error.statusCode ||
    (isMulter || isValidation || isSafeUpload ? 400 : 500);

  if (process.env.NODE_ENV !== "production") {
    console.error(`${req.method} ${req.originalUrl}:`, error);
  } else if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl}: ${error.message}`);
  }

  const safeMessage = status >= 500 && process.env.NODE_ENV === "production"
    ? "Internal server error"
    : error.message || "Internal server error";

  res.status(status).json({
    success: false,
    message: safeMessage,
    ...(process.env.NODE_ENV !== "production" && status >= 500
      ? { error: error.name || "Error" }
      : {}),
  });
};

module.exports = { notFound, errorHandler };
