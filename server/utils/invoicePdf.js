const PDFDocument = require("pdfkit");

const money = (amount, currency) =>
  `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`;

const addDetail = (doc, label, value, x, y, width = 240) => {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151").text(label, x, y, { width });
  doc.font("Helvetica").fillColor("#111827").text(value || "-", x, y + 13, { width });
};

const streamInvoicePdf = (invoice, res) => {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: {
    Title: `Invoice ${invoice.invoiceNumber}`,
    Author: "MSK Print Cloud",
  } });

  doc.on("error", (error) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Unable to generate invoice PDF" });
    } else {
      res.destroy(error);
    }
  });
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 116).fill("#1f2937");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22)
    .text(invoice.shop.name, 48, 38, { width: 310 });
  doc.font("Helvetica").fontSize(10)
    .text(invoice.shop.branchName || "", 48, 69, { width: 310 });
  doc.font("Helvetica-Bold").fontSize(28).text("INVOICE", 390, 40, {
    width: 155,
    align: "right",
  });
  doc.font("Helvetica").fontSize(9).text(invoice.invoiceNumber, 355, 76, {
    width: 190,
    align: "right",
  });

  doc.fillColor("#111827");
  let y = 142;
  addDetail(doc, "FROM", [
    invoice.shop.address,
    invoice.shop.phone,
    invoice.shop.email,
    invoice.shop.gstNumber ? `GSTIN: ${invoice.shop.gstNumber}` : "",
  ].filter(Boolean).join("\n"), 48, y, 235);
  addDetail(doc, "BILL TO", [
    invoice.customer.name,
    invoice.customer.email,
  ].filter(Boolean).join("\n"), 310, y, 235);
  y = 225;
  addDetail(doc, "INVOICE DATE", new Date(invoice.invoiceDate).toLocaleDateString("en-IN"), 48, y, 140);
  addDetail(doc, "PAYMENT", `${invoice.payment.method || "-"} · ${invoice.payment.status}`, 220, y, 220);
  addDetail(doc, "ORDER STATUS", invoice.order.status, 455, y, 90);

  y = 278;
  doc.rect(48, y, 497, 27).fill("#e5e7eb");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  doc.text("DESCRIPTION", 57, y + 9, { width: 210 });
  doc.text("PAGES", 276, y + 9, { width: 48, align: "right" });
  doc.text("COPIES", 335, y + 9, { width: 48, align: "right" });
  doc.text("SETTINGS", 398, y + 9, { width: 138 });

  y += 27;
  const rowHeight = 64;
  doc.rect(48, y, 497, rowHeight).strokeColor("#d1d5db").stroke();
  doc.font("Helvetica-Bold").fontSize(10).text(invoice.order.fileName, 57, y + 12, { width: 210 });
  doc.font("Helvetica").fontSize(9).fillColor("#4b5563")
    .text(invoice.order.paperSize, 57, y + 31, { width: 210 });
  doc.fillColor("#111827").text(String(invoice.order.pages), 276, y + 21, { width: 48, align: "right" });
  doc.text(String(invoice.order.copies), 335, y + 21, { width: 48, align: "right" });
  doc.text(`${invoice.order.printType}\n${invoice.order.side}`, 398, y + 14, { width: 138 });

  y += 92;
  const totalsX = 330;
  const valueX = 455;
  doc.font("Helvetica").fontSize(10);
  doc.text("Subtotal", totalsX, y);
  doc.text(money(invoice.amounts.subtotal, invoice.amounts.currency), valueX, y, { width: 90, align: "right" });
  y += 22;
  doc.text(`GST (${invoice.amounts.gstRate}%)`, totalsX, y);
  doc.text(money(invoice.amounts.gstAmount, invoice.amounts.currency), valueX, y, { width: 90, align: "right" });
  y += 25;
  doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#9ca3af").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(12).text("TOTAL", totalsX, y);
  doc.text(money(invoice.amounts.total, invoice.amounts.currency), valueX, y, { width: 90, align: "right" });

  y += 70;
  doc.font("Helvetica-Bold").fontSize(10).text("Payment details", 48, y);
  doc.font("Helvetica").fontSize(9).fillColor("#374151");
  const paymentReference = invoice.payment.razorpayPaymentId || invoice.payment.upiReference || "-";
  doc.text(`Method: ${invoice.payment.method || "-"}   Status: ${invoice.payment.status}   Reference: ${paymentReference}`, 48, y + 17, { width: 497 });

  doc.font("Helvetica").fontSize(10).fillColor("#6b7280")
    .text("Thank you for choosing MSK Print Cloud.", 48, 760, {
      width: 497,
      align: "center",
    });
  doc.end();
};

module.exports = { streamInvoicePdf };
