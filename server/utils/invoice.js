const createInvoiceNumber = (jobId) =>
  `MSK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${jobId.toString().toUpperCase()}`;

module.exports = { createInvoiceNumber };
