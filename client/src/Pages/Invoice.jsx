import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";

const formatMoney = (value, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
};

function Invoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    API.get(`/api/invoices/${id}`)
      .then((response) => setInvoice(response.data?.invoice || null))
      .catch((loadError) => {
        setError(loadError.response?.data?.message || "Unable to load invoice");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    try {
      setDownloading(true);
      setError("");
      const response = await API.get(`/api/invoices/${id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MSK-Invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.response?.data?.message || "Unable to download invoice PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <><Navbar /><div className="container py-5 text-center">Loading invoice...</div></>;
  }
  if (error && !invoice) {
    return (
      <>
        <Navbar />
        <div className="container py-5">
          <div className="alert alert-danger">{error}</div>
          <button className="btn btn-primary" onClick={() => navigate("/orders")}>Back to Orders</button>
        </div>
      </>
    );
  }
  if (!invoice) return null;

  const reference = invoice.payment.razorpayPaymentId || invoice.payment.upiReference;

  return (
    <>
      <div className="d-print-none"><Navbar /></div>
      <main className="container my-4 invoice-page">
        {error && <div className="alert alert-danger d-print-none">{error}</div>}
        <div className="card shadow border-0 invoice-card">
          <div className="card-body p-4 p-md-5">
            <header className="d-flex justify-content-between gap-4 border-bottom pb-4">
              <div className="d-flex gap-3">
                {invoice.shop.logo && (
                  <img
                    src={invoice.shop.logo}
                    alt={`${invoice.shop.name} logo`}
                    className="invoice-logo"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                )}
                <div>
                  <h2 className="mb-1">{invoice.shop.name}</h2>
                  <div>{invoice.shop.branchName}</div>
                  {invoice.shop.address && <div className="text-muted">{invoice.shop.address}</div>}
                  <div className="text-muted">{[invoice.shop.phone, invoice.shop.email].filter(Boolean).join(" · ")}</div>
                  {invoice.shop.gstNumber && <div className="small">GSTIN: {invoice.shop.gstNumber}</div>}
                </div>
              </div>
              <div className="text-end">
                <h1 className="text-uppercase mb-2">Invoice</h1>
                <strong>{invoice.invoiceNumber}</strong>
                <div className="text-muted">
                  {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("en-IN") : "—"}
                </div>
              </div>
            </header>

            <section className="row py-4">
              <div className="col-md-6">
                <div className="text-uppercase small text-muted fw-bold">Bill To</div>
                <h5 className="mb-1">{invoice.customer.name}</h5>
                <div>{invoice.customer.email || "Email unavailable"}</div>
              </div>
              <div className="col-md-6 text-md-end mt-3 mt-md-0">
                <div><strong>Payment:</strong> {invoice.payment.method || "—"}</div>
                <div><strong>Payment status:</strong> <span className="badge bg-success">{invoice.payment.status}</span></div>
                <div><strong>Order status:</strong> {invoice.order.status}</div>
              </div>
            </section>

            <div className="table-responsive">
              <table className="table table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Description</th><th>Pages</th><th>Copies</th>
                    <th>Paper</th><th>Print Type</th><th>Side</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{invoice.order.fileName}</td>
                    <td>{invoice.order.pages}</td>
                    <td>{invoice.order.copies}</td>
                    <td>{invoice.order.paperSize}</td>
                    <td>{invoice.order.printType}</td>
                    <td>{invoice.order.side}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="row justify-content-end mt-4">
              <div className="col-md-5">
                <div className="d-flex justify-content-between py-2 border-bottom">
                  <span>Price before GST</span>
                  <span>{formatMoney(invoice.amounts.subtotal, invoice.amounts.currency)}</span>
                </div>
                <div className="d-flex justify-content-between py-2 border-bottom">
                  <span>GST ({invoice.amounts.gstRate}%)</span>
                  <span>{formatMoney(invoice.amounts.gstAmount, invoice.amounts.currency)}</span>
                </div>
                <div className="d-flex justify-content-between py-3 fs-5 fw-bold">
                  <span>Total</span>
                  <span>{formatMoney(invoice.amounts.total, invoice.amounts.currency)}</span>
                </div>
              </div>
            </div>

            <section className="border-top pt-3 mt-3">
              <strong>Payment details</strong>
              <div>{invoice.payment.method || "—"} · {invoice.payment.status}</div>
              {reference && <div className="small text-muted">Reference: {reference}</div>}
            </section>
            <footer className="text-center text-muted border-top mt-4 pt-4">
              Thank you for choosing MSK Print Cloud.
            </footer>
          </div>
        </div>

        <div className="invoice-actions d-flex flex-wrap gap-2 mt-4 d-print-none">
          <button className="btn btn-outline-dark" onClick={() => window.print()}>Print Invoice</button>
          <button className="btn btn-success" onClick={downloadPdf} disabled={downloading}>
            {downloading ? "Downloading..." : "Download PDF"}
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/orders")}>Back to Orders</button>
        </div>
      </main>
    </>
  );
}

export default Invoice;
