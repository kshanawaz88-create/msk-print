import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import API from "../Services/Api";
import Navbar from "../components/Navbar";

function Payment() {
  const [order, setOrder] = useState(null);
  const [copies, setCopies] = useState(1);
  const [printType, setPrintType] = useState("Black & White");
  const [side, setSide] = useState("Single Side");
  const [price, setPrice] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    shopName: "MSK Print Cloud",
    blackWhitePrice: 2,
    colorPrice: 10,
    currency: "₹",
    upiId: "",
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const jobId = localStorage.getItem("printJobId");

        if (!jobId) {
          alert("No print order found.");
          window.location.href = "/upload";
          return;
        }

        const [orderRes, settingsRes] = await Promise.all([
          API.get(`/api/print/${jobId}`),
          API.get("/api/settings"),
        ]);

        const orderData =
          orderRes.data?.printJob ||
          orderRes.data?.order ||
          orderRes.data;

        const settingsData =
          settingsRes.data?.settings ||
          settingsRes.data;

        setOrder(orderData);

        setSettings((previous) => ({
          ...previous,
          ...settingsData,
          blackWhitePrice:
            Number(settingsData?.blackWhitePrice) || 2,
          colorPrice:
            Number(settingsData?.colorPrice) || 10,
        }));
      } catch (error) {
        console.log("Payment data loading error:", error);

        alert(
          error.response?.data?.message ||
            "Unable to load payment details."
        );
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!order) return;

    const pages = Number(order.pages) || 1;
    const validCopies = Math.max(Number(copies) || 1, 1);

    const rate =
      printType === "Color"
        ? Number(settings.colorPrice) || 10
        : Number(settings.blackWhitePrice) || 2;

    let total = pages * validCopies * rate;

    if (side === "Double Side") {
      total = Math.round(total * 0.9);
    }

    setPrice(Math.max(total, 1));
  }, [
    order,
    copies,
    printType,
    side,
    settings.blackWhitePrice,
    settings.colorPrice,
  ]);

  const upiPaymentLink = useMemo(() => {
    if (!settings.upiId || !price) return "";

    const params = new URLSearchParams({
      pa: settings.upiId,
      pn: settings.shopName || "MSK Print Cloud",
      am: Number(price).toFixed(2),
      cu: "INR",
      tn: `Print order ${order?._id || ""}`,
    });

    return `upi://pay?${params.toString()}`;
  }, [
    settings.upiId,
    settings.shopName,
    price,
    order,
  ]);

  const saveOrderOptions = async (extraData = {}) => {
    const jobId = localStorage.getItem("printJobId");

    if (!jobId) {
      throw new Error("Print job ID is missing.");
    }

    await API.put(`/api/print/${jobId}`, {
      copies: Math.max(Number(copies) || 1, 1),
      printType,
      side,
      price,
      status: "Pending",
      ...extraData,
    });
  };

  const proceedRazorpayPayment = async () => {
    try {
      if (!window.Razorpay) {
        alert(
          "Razorpay checkout is not loaded. Please refresh the page."
        );
        return;
      }

      setSaving(true);

      const orderResponse = await API.post(
        "/api/payment/create-order",
        {
          amount: price,
          printJobId: order._id,
        }
      );

      const razorpayOrder =
        orderResponse.data?.order ||
        orderResponse.data;

      const options = {
        key: orderResponse.data?.key,

        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || "INR",
        order_id: razorpayOrder.id,

        name: settings.shopName,
        description: "Print Order Payment",

        handler: async function (paymentResponse) {
          try {
            const verifyResponse = await API.post(
              "/api/payment/verify",
              {
                printJobId: order._id,

                razorpay_order_id:
                  paymentResponse.razorpay_order_id,

                razorpay_payment_id:
                  paymentResponse.razorpay_payment_id,

                razorpay_signature:
                  paymentResponse.razorpay_signature,

                copies: Math.max(Number(copies) || 1, 1),
                printType,
                side,
                price,
              }
            );

            if (verifyResponse.data?.success) {
              localStorage.setItem(
                "razorpayPaymentId",
                paymentResponse.razorpay_payment_id
              );

              localStorage.removeItem("printJobId");

              window.location.href = "/success";
            } else {
              alert("Payment verification failed.");
            }
          } catch (error) {
            console.log(
              "Payment verification failed:",
              error
            );

            alert(
              error.response?.data?.message ||
                "Payment verification failed."
            );

            setSaving(false);
          }
        },

        modal: {
          ondismiss: function () {
            setSaving(false);
          },
        },

        theme: {
          color: "#198754",
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", function (response) {
        console.log("Payment failed:", response.error);

        alert(
          response.error?.description ||
            "Payment failed. Please try again."
        );

        setSaving(false);
      });

      razorpay.open();
    } catch (error) {
      console.log("Razorpay start error:", error);

      alert(
        error.response?.data?.message ||
          "Unable to start Razorpay payment."
      );

      setSaving(false);
    }
  };

  const confirmManualUpiPayment = async () => {
    const reference = window.prompt(
      "Enter your UPI transaction/reference number:"
    );

    if (!reference || !reference.trim()) {
      return;
    }

    try {
      setSaving(true);

      await saveOrderOptions({
        paymentStatus: "Pending",
        notes:
          `UPI payment submitted for manual verification. ` +
          `Reference: ${reference.trim()}`,
      });

      localStorage.setItem(
        "upiPaymentReference",
        reference.trim()
      );

      alert(
        "Payment details submitted. The shop will verify the payment."
      );

      window.location.href = "/success";
    } catch (error) {
      console.log("UPI confirmation error:", error);

      alert(
        error.response?.data?.message ||
          "Unable to submit payment details."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!order) {
    return (
      <>
        <Navbar />
        <h3 className="text-center mt-5">Loading...</h3>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div className="container mt-5 mb-5">
        <div className="row justify-content-center">
          <div className="col-lg-9">
            <div className="card shadow-lg border-0">
              <div className="card-header bg-success text-white">
                <h3 className="mb-0">
                  💳 Payment Details
                </h3>
              </div>

              <div className="card-body">
                <h5>{settings.shopName}</h5>

                <table className="table table-bordered">
                  <tbody>
                    <tr>
                      <th>File</th>
                      <td>{order.fileName}</td>
                    </tr>

                    <tr>
                      <th>Pages</th>
                      <td>{order.pages || 0}</td>
                    </tr>

                    <tr>
                      <th>Status</th>
                      <td>{order.status}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="row">
                  <div className="col-md-4 mb-3">
                    <label className="form-label">
                      Number of Copies
                    </label>

                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={copies}
                      onChange={(e) =>
                        setCopies(
                          Math.max(
                            Number(e.target.value) || 1,
                            1
                          )
                        )
                      }
                    />
                  </div>

                  <div className="col-md-4 mb-3">
                    <label className="form-label">
                      Print Type
                    </label>

                    <select
                      className="form-select"
                      value={printType}
                      onChange={(e) =>
                        setPrintType(e.target.value)
                      }
                    >
                      <option value="Black & White">
                        Black & White
                      </option>

                      <option value="Color">
                        Color
                      </option>
                    </select>
                  </div>

                  <div className="col-md-4 mb-3">
                    <label className="form-label">
                      Printing Side
                    </label>

                    <select
                      className="form-select"
                      value={side}
                      onChange={(e) =>
                        setSide(e.target.value)
                      }
                    >
                      <option value="Single Side">
                        Single Side
                      </option>

                      <option value="Double Side">
                        Double Side
                      </option>
                    </select>
                  </div>
                </div>

                <div className="alert alert-info">
                  <strong>B&amp;W:</strong>{" "}
                  {settings.currency}
                  {settings.blackWhitePrice}/page
                  <br />

                  <strong>Color:</strong>{" "}
                  {settings.currency}
                  {settings.colorPrice}/page

                  <hr />

                  <h4 className="mb-0">
                    Total: {settings.currency}
                    {price}
                  </h4>
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <button
                      type="button"
                      className="btn btn-success btn-lg w-100"
                      onClick={proceedRazorpayPayment}
                      disabled={saving}
                    >
                      {saving
                        ? "Processing..."
                        : "💳 Pay with Razorpay"}
                    </button>
                  </div>

                  <div className="col-md-6">
                    <button
                      type="button"
                      className="btn btn-primary btn-lg w-100"
                      onClick={() => setShowQr(!showQr)}
                      disabled={!settings.upiId || saving}
                    >
                      {showQr
                        ? "✖ Hide UPI QR"
                        : "📱 Pay using UPI QR"}
                    </button>
                  </div>
                </div>

                {!settings.upiId && (
                  <div className="alert alert-warning mt-3">
                    The shop has not added a UPI ID yet.
                    Add it from Shop Settings to enable QR
                    payments.
                  </div>
                )}

                {showQr && upiPaymentLink && (
                  <div className="card mt-4 border-primary">
                    <div className="card-body text-center">
                      <h4>Scan and Pay</h4>

                      <p className="text-muted">
                        Use any UPI application
                      </p>

                      <div className="d-inline-block p-3 bg-white border rounded">
                        <QRCodeSVG
                          value={upiPaymentLink}
                          size={230}
                          level="H"
                          title="UPI payment QR code"
                        />
                      </div>

                      <h4 className="mt-3">
                        Amount: {settings.currency}
                        {price}
                      </h4>

                      <p className="mb-1">
                        <strong>UPI ID:</strong>{" "}
                        {settings.upiId}
                      </p>

                      <a
                        href={upiPaymentLink}
                        className="btn btn-outline-primary mt-3 me-2"
                      >
                        Open UPI App
                      </a>

                      <button
                        type="button"
                        className="btn btn-success mt-3"
                        onClick={confirmManualUpiPayment}
                        disabled={saving}
                      >
                        ✅ I Have Paid
                      </button>

                      <div className="alert alert-warning mt-3 mb-0">
                        UPI payments remain pending until the
                        shop verifies the transaction reference.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Payment;