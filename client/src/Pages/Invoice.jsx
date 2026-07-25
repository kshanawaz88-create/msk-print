import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";

const formatMoney = (value, currency = "INR") => {
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase())
    ? String(currency).toUpperCase()
    : "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${safeCurrency} ${Number(value || 0).toFixed(2)}`;
  }
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-IN")
    : "Unavailable";
};

const safeLogoUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
};

const blobErrorMessage = async (error) => {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.message || "Unable to download invoice PDF";
    } catch {
      return "Unable to download invoice PDF";
    }
  }
  return data?.message || error.message || "Unable to download invoice PDF";
};

function Invoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    API.get(`/api/invoices/${encodeURIComponent(id)}`)
      .then((response) => {
        if (!active) return;
        const result = response.data?.invoice;
        if (!response.data?.success || !result || typeof result !== "object") {
          throw new Error("The server returned an invalid invoice.");
        }
        setInvoice(result);
      })
      .catch((loadError) => {
        if (!active) return;
        setInvoice(null);
        setError(loadError.response?.data?.message || loadError.message || "Unable to load invoice");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const shop = invoice?.shop || {};
  const customer = invoice?.customer || {};
  const order = invoice?.order || {};
  const amounts = invoice?.amounts || {};
  const payment = invoice?.payment || {};
  const reference = payment.razorpayPaymentId || payment.upiReference || "";
  const logoUrl = useMemo(() => safeLogoUrl(shop.logo), [shop.logo]);

  const downloadPdf = async () => {
    try {
      setDownloading(true);
      setError("");
      const response = await API.get(`/api/invoices/${encodeURIComponent(id)}/pdf`, {
        responseType: "blob",
      });
      const contentType = String(response.headers?.["content-type"] || response.data?.type || "");
      if (!(response.data instanceof Blob) || response.data.size === 0 || !contentType.includes("application/pdf")) {
        throw new Error("The server did not return a valid PDF invoice.");
      }

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      const safeInvoiceNumber = String(invoice?.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9_-]/g, "-");
      link.href = url;
      link.download = `MSK-Invoice-${safeInvoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(await blobErrorMessage(downloadError));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <><Navbar /><div className="container py-5 text-center">Loading invoice...</div></>;
  }

  if (!invoice) {
    return (
      <>
        <Navbar />
        <div className="container py-5">
          <div className="alert alert-danger">{error || "Invoice unavailable"}</div>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/orders")}>
            Back to Orders
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="d-print-none"><Navbar /></div>
      <main className="container my-4 invoice-page">
        {error && <div className="alert alert-danger d-print-none">{error}</div>}
        <div className="card shadow border-0 invoice-card">
          <div className="card-body p-4 p-md-5">
            <header className="d-flex justify-content-between flex-wrap gap-4 border-bottom pb-4">
              <div className="d-flex gap-3">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={`${shop.name || "Shop"} logo`}
                    className="invoice-logo"
                    referrerPolicy="no-referrer"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                )}
                <div>
                  <h2 className="mb-1">{shop.name || "MSK Print Cloud"}</h2>
                  {shop.branchName && <div>{shop.branchName}</div>}
                  {shop.address && <div className="text-muted">{shop.address}</div>}
                  {(shop.phone || shop.email) && (
                    <div className="text-muted">{[shop.phone, shop.email].filter(Boolean).join(" · ")}</div>
                  )}
                  {shop.gstNumber && <div className="small">GSTIN: {shop.gstNumber}</div>}
                </div>
              </div>
              <div className="text-md-end">
                <h1 className="text-uppercase mb-2">Invoice</h1>
                <strong>{invoice.invoiceNumber || "Unavailable"}</strong>
                <div className="text-muted">{formatDate(invoice.invoiceDate)}</div>
              </div>
            </header>

            <section className="row py-4">
              <div className="col-md-6">
                <div className="text-uppercase small text-muted fw-bold">Bill To</div>
                <h5 className="mb-1">{customer.name || "Customer"}</h5>
                <div>{customer.email || "Email unavailable"}</div>
              </div>
              <div className="col-md-6 text-md-end mt-3 mt-md-0">
                <div><strong>Payment:</strong> {payment.method || "Unavailable"}</div>
                <div>
                  <strong>Payment status:</strong>{" "}
                  <span className={`badge ${payment.status === "Paid" ? "bg-success" : "bg-secondary"}`}>
                    {payment.status || "Unavailable"}
                  </span>
                </div>
                <div><strong>Order status:</strong> {order.status || "Unavailable"}</div>
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
                    <td>{order.fileName || "Print order"}</td>
                    <td>{Number(order.pages) || 1}</td>
                    <td>{Number(order.copies) || 1}</td>
                    <td>{order.paperSize || "A4"}</td>
                    <td>{order.printType || "Black & White"}</td>
                    <td>{order.side || "Single Side"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="row justify-content-end mt-4">
              <div className="col-md-5">
                <div className="d-flex justify-content-between py-2 border-bottom">
                  <span>Price before GST</span>
                  <span>{formatMoney(amounts.subtotal, amounts.currency)}</span>
                </div>
                <div className="d-flex justify-content-between py-2 border-bottom">
                  <span>GST ({Number(amounts.gstRate || 0)}%)</span>
                  <span>{formatMoney(amounts.gstAmount, amounts.currency)}</span>
                </div>
                <div className="d-flex justify-content-between py-3 fs-5 fw-bold">
                  <span>Total</span>
                  <span>{formatMoney(amounts.total, amounts.currency)}</span>
                </div>
              </div>
            </div>

            <section className="border-top pt-3 mt-3">
              <strong>Payment details</strong>
              <div>{payment.method || "Unavailable"} · {payment.status || "Unavailable"}</div>
              {reference && <div className="small text-muted">Reference: {reference}</div>}
            </section>
            <footer className="text-center text-muted border-top mt-4 pt-4">
              Thank you for choosing MSK Print Cloud.
            </footer>
          </div>
        </div>

        <div className="invoice-actions d-flex flex-wrap gap-2 mt-4 d-print-none">
          <button className="btn btn-outline-dark" type="button" onClick={() => window.print()}>Print Invoice</button>
          <button className="btn btn-success" type="button" onClick={downloadPdf} disabled={downloading}>
            {downloading ? "Downloading..." : "Download PDF"}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/orders")}>Back to Orders</button>
        </div>
      </main>
    </>
  );
}

export default Invoice;
