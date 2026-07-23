import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import { QRCodeSVG } from "qrcode.react";

import API from "../Services/Api";
import Navbar from "../components/Navbar";

const initialPaymentConfig = {
  shopName: "MSK Print Cloud",
  shopCode: "",
  paymentEnabled: true,
  paymentMode: "both",
  paymentInstructions: "",
  razorpayAvailable: false,
  upiAvailable: false,
  upiId: "",
  currency: "INR",
  currencySymbol: "₹",
};

function Payment() {
  const navigate = useNavigate();

  const {
    shopCode,
    orderToken,
  } = useParams();

  /*
    Guest mode URL:

    /shop/:shopCode/payment/:orderToken

    Authenticated mode URL:

    /payment
  */
  const isGuestPayment =
    Boolean(shopCode && orderToken);

  const [order, setOrder] =
    useState(null);

  const [
    paymentConfig,
    setPaymentConfig,
  ] = useState(initialPaymentConfig);

  const [copies, setCopies] =
    useState(1);

  const [
    printType,
    setPrintType,
  ] = useState("Black & White");

  const [side, setSide] =
    useState("Single Side");

  const [
    paperSize,
    setPaperSize,
  ] = useState("A4");

  const [price, setPrice] =
    useState(0);

  const [showQr, setShowQr] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [quoting, setQuoting] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /*
    Loads either:

    1. Guest order using the public order token.
    2. Logged-in order using printJobId.
  */
  useEffect(() => {
    let active = true;

    const loadGuestOrder = async () => {
      const response = await API.get(
        `/api/public/orders/${encodeURIComponent(
          orderToken
        )}`,
        {
          params: {
            shopCode,
          },
        }
      );

      const orderData =
        response.data?.order ||
        response.data?.job;

      const shopData =
        response.data?.shop ||
        orderData?.shop ||
        {};

      const payment =
        response.data?.payment ||
        {};

      if (!orderData) {
        throw new Error(
          "The public order could not be loaded."
        );
      }

      return {
        orderData,
        shopData,
        payment,
      };
    };

    const loadAuthenticatedOrder =
      async () => {
        const jobId =
          localStorage.getItem(
            "printJobId"
          );

        if (!jobId) {
          throw new Error(
            "No active print order was found."
          );
        }

        const [
          orderResponse,
          configResponse,
        ] = await Promise.all([
          API.get(
            `/api/print/${encodeURIComponent(
              jobId
            )}`
          ),

          API.get(
            `/api/payment/config/${encodeURIComponent(
              jobId
            )}`
          ),
        ]);

        return {
          orderData:
            orderResponse.data?.job ||
            orderResponse.data,

          shopData:
            configResponse.data?.shop ||
            {},

          payment:
            configResponse.data
              ?.payment || {},
        };
      };

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const result =
          isGuestPayment
            ? await loadGuestOrder()
            : await loadAuthenticatedOrder();

        if (!active) {
          return;
        }

        const {
          orderData,
          shopData,
          payment,
        } = result;

        setOrder(orderData);

        setCopies(
          orderData.copies || 1
        );

        setPrintType(
          orderData.printType ||
            "Black & White"
        );

        setSide(
          orderData.side ||
            "Single Side"
        );

        setPaperSize(
          orderData.paperSize ||
            "A4"
        );

        setPrice(
          Number(
            orderData.price || 0
          )
        );

        setPaymentConfig({
          shopName:
            shopData.shopName ||
            orderData.shop?.shopName ||
            "MSK Print Cloud",

          shopCode:
            shopData.shopCode ||
            orderData.shop?.shopCode ||
            shopCode ||
            "",

          paymentEnabled:
            payment.paymentEnabled !==
            false,

          paymentMode:
            payment.paymentMode ||
            "both",

          paymentInstructions:
            payment.paymentInstructions ||
            "",

          razorpayAvailable:
            payment.razorpayAvailable ===
            true,

          upiAvailable:
            payment.upiAvailable ===
            true,

          upiId:
            payment.upiId || "",

          currency:
            payment.currency ||
            orderData.currency ||
            "INR",

          currencySymbol:
            payment.currencySymbol ||
            shopData.currency ||
            "₹",
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError.response?.data
            ?.message ||
            loadError.message ||
            "Unable to load payment details."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [
    isGuestPayment,
    orderToken,
    shopCode,
  ]);

  /*
    Guest order options have already been
    calculated and saved during public upload.

    Authenticated customers can still update
    their print options before payment starts.
  */
  useEffect(() => {
    if (
      !order?._id ||
      isGuestPayment
    ) {
      return undefined;
    }

    let active = true;

    const timer = setTimeout(
      async () => {
        try {
          setQuoting(true);
          setError("");

          const response =
            await API.post(
              "/api/payment/quote",
              {
                printJobId:
                  order._id,

                copies: Math.max(
                  Number(copies) || 1,
                  1
                ),

                printType,
                side,
                paperSize,
              }
            );

          const quotedPrice =
            Number(
              response.data?.price
            );

          if (
            !response.data
              ?.success ||
            !Number.isFinite(
              quotedPrice
            ) ||
            quotedPrice <= 0
          ) {
            throw new Error(
              "The server returned an invalid price quote."
            );
          }

          if (active) {
            setPrice(
              quotedPrice
            );
          }
        } catch (quoteError) {
          if (active) {
            setPrice(0);

            setError(
              quoteError.response
                ?.data?.message ||
                quoteError.message ||
                "Unable to calculate price."
            );
          }
        } finally {
          if (active) {
            setQuoting(false);
          }
        }
      },
      250
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    order,
    isGuestPayment,
    copies,
    printType,
    side,
    paperSize,
  ]);

  const authenticatedOptionsPayload =
    () => ({
      printJobId: order._id,

      copies: Math.max(
        Number(copies) || 1,
        1
      ),

      printType,
      side,
      paperSize,
    });

  const guestOrderPayload = () => ({
    orderToken,
    shopCode,
  });

  const upiPaymentLink =
    useMemo(() => {
      if (
        !paymentConfig.upiAvailable ||
        !paymentConfig.upiId ||
        !price
      ) {
        return "";
      }

      const params =
        new URLSearchParams({
          pa: paymentConfig.upiId,
          pn:
            paymentConfig.shopName,
          am: Number(
            price
          ).toFixed(2),
          cu: "INR",
          tn: `Print order ${
            order?._id || ""
          }`,
        });

      return `upi://pay?${params.toString()}`;
    }, [
      paymentConfig,
      price,
      order,
    ]);

  const finishPayment = (
    jobId
  ) => {
    localStorage.setItem(
      "currentOrderId",
      jobId
    );

    localStorage.setItem(
      "completedJobId",
      jobId
    );

    if (isGuestPayment) {
      navigate(
        `/shop/${encodeURIComponent(
          shopCode
        )}/success/${encodeURIComponent(
          orderToken
        )}`
      );

      return;
    }

    localStorage.removeItem(
      "printJobId"
    );

    navigate("/success");
  };
    const proceedRazorpayPayment = async () => {
    if (!paymentConfig.paymentEnabled) {
      window.alert("Payments are currently disabled.");
      return;
    }

    if (!paymentConfig.razorpayAvailable) {
      window.alert("Razorpay is not available.");
      return;
    }

    if (!window.Razorpay) {
      window.alert(
        "Razorpay checkout failed to load."
      );
      return;
    }

    if (saving || quoting) {
      return;
    }

    try {
      setSaving(true);

      const response = isGuestPayment
        ? await API.post(
            "/api/public/payment/create-order",
            guestOrderPayload()
          )
        : await API.post(
            "/api/payment/create-order",
            authenticatedOptionsPayload()
          );

      const razorpayOrder =
        response.data?.order;

      const keyId =
        response.data?.keyId;

      if (
        !keyId ||
        !razorpayOrder?.id
      ) {
        throw new Error(
          "Invalid Razorpay response."
        );
      }

      if (
        Number.isFinite(
          Number(
            response.data?.quote?.price
          )
        )
      ) {
        setPrice(
          Number(
            response.data.quote.price
          )
        );
      }

      const razorpay =
        new window.Razorpay({
          key: keyId,

          amount:
            razorpayOrder.amount,

          currency:
            razorpayOrder.currency ||
            "INR",

          order_id:
            razorpayOrder.id,

          name:
            paymentConfig.shopName,

          description:
            "Print Order Payment",

          theme: {
            color: "#198754",
          },

          modal: {
            ondismiss: () =>
              setSaving(false),
          },

          handler: async (
            checkoutResponse
          ) => {
            try {
              const verification =
                isGuestPayment
                  ? await API.post(
                      "/api/public/payment/verify",
                      {
                        ...guestOrderPayload(),

                        razorpay_order_id:
                          checkoutResponse.razorpay_order_id,

                        razorpay_payment_id:
                          checkoutResponse.razorpay_payment_id,

                        razorpay_signature:
                          checkoutResponse.razorpay_signature,
                      }
                    )
                  : await API.post(
                      "/api/payment/verify",
                      {
                        ...authenticatedOptionsPayload(),

                        razorpay_order_id:
                          checkoutResponse.razorpay_order_id,

                        razorpay_payment_id:
                          checkoutResponse.razorpay_payment_id,

                        razorpay_signature:
                          checkoutResponse.razorpay_signature,
                      }
                    );

              if (
                !verification.data
                  ?.success
              ) {
                throw new Error(
                  "Payment verification failed."
                );
              }

              finishPayment(
                order._id
              );
            } catch (
              verificationError
            ) {
              window.alert(
                verificationError
                  .response?.data
                  ?.message ||
                  verificationError.message
              );

              setSaving(false);
            }
          },
        });

      razorpay.on(
        "payment.failed",
        (failure) => {
          window.alert(
            failure.error
              ?.description ||
              "Payment failed."
          );

          setSaving(false);
        }
      );

      razorpay.open();
    } catch (error) {
      window.alert(
        error.response?.data
          ?.message ||
          error.message ||
          "Unable to start payment."
      );

      setSaving(false);
    }
  };

  const confirmManualUpiPayment =
    async () => {
      if (
        !paymentConfig.paymentEnabled
      ) {
        window.alert(
          "Payments are disabled."
        );

        return;
      }

      if (
        !paymentConfig.upiAvailable
      ) {
        window.alert(
          "UPI is unavailable."
        );

        return;
      }

      const reference =
        window.prompt(
          "Enter your UPI transaction number."
        );

      if (!reference?.trim()) {
        return;
      }

      try {
        setSaving(true);

        if (
          isGuestPayment
        ) {
          await API.post(
            "/api/public/payment/upi",
            {
              ...guestOrderPayload(),

              upiReference:
                reference.trim(),
            }
          );
        } else {
          await API.post(
            "/api/payment/upi",
            {
              ...authenticatedOptionsPayload(),

              upiReference:
                reference.trim(),
            }
          );
        }

        window.alert(
          "Payment submitted successfully."
        );

        finishPayment(
          order._id
        );
      } catch (error) {
        window.alert(
          error.response?.data
            ?.message ||
            error.message ||
            "Unable to submit payment."
        );
      } finally {
        setSaving(false);
      }
    };
    const selectCashPayment = async () => {
  if (saving || quoting) {
    return;
  }

  const confirmed = window.confirm(
    `Choose Pay at Shop / Cash?\n\nAmount: ${
      paymentConfig.currencySymbol || "₹"
    }${Number(price || 0).toFixed(
      2
    )}\n\nPrinting will begin only after the shop receives and confirms your cash payment.`
  );

  if (!confirmed) {
    return;
  }

  try {
    setSaving(true);
    setError("");

    let response;

    if (isGuestPayment) {
      response = await API.post(
        "/api/public/payment/cash",
        {
          ...guestOrderPayload(),
        }
      );
    } else {
      response = await API.post(
        "/api/payment/cash",
        authenticatedOptionsPayload()
      );
    }

    if (!response.data?.success) {
      throw new Error(
        "Unable to create cash payment order."
      );
    }

    window.alert(
      "Order created. Please pay at the shop counter."
    );

    finishPayment(order._id);
  } catch (cashError) {
    window.alert(
      cashError.response?.data
        ?.message ||
        cashError.message ||
        "Unable to select cash payment."
    );
  } finally {
    setSaving(false);
  }
};

  if (loading) {
    return (
      <>
        <Navbar />

        <div className="container mt-5">
          <div className="text-center">

            <div className="spinner-border text-success" />

            <h3 className="mt-3">
              Loading payment...
            </h3>

          </div>
        </div>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Navbar />

        <div className="container mt-5">

          <div className="alert alert-danger">

            {error ||
              "Unable to load payment."}

          </div>

        </div>
      </>
    );
  }  const showNavbar = !isGuestPayment;

  return (
    <>
      {showNavbar && <Navbar />}

      <div
        style={{
          minHeight: "100vh",
          background: "#f4f6f9",
          paddingTop: showNavbar ? "0" : "30px",
        }}
      >
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-9">
              <div className="card shadow-lg border-0">
                <div
                  className="card-header text-white"
                  style={{
                    backgroundColor: "#198754",
                  }}
                >
                  <h3 className="mb-0">
                    Payment Details
                  </h3>
                </div>

                <div className="card-body p-4">
                  <div className="mb-4">
                    <h4 className="mb-1">
                      {paymentConfig.shopName}
                    </h4>

                    {paymentConfig.shopCode && (
                      <p className="text-muted mb-0">
                        Shop code:{" "}
                        {paymentConfig.shopCode}
                      </p>
                    )}
                  </div>

                  <div className="table-responsive mb-4">
                    <table className="table table-bordered align-middle">
                      <tbody>
                        <tr>
                          <th style={{ width: "35%" }}>
                            File
                          </th>

                          <td>
                            {order.fileName}
                          </td>
                        </tr>

                        <tr>
                          <th>Pages</th>

                          <td>
                            {order.pages || 1}
                          </td>
                        </tr>

                        <tr>
                          <th>Copies</th>

                          <td>
                            {copies}
                          </td>
                        </tr>

                        <tr>
                          <th>Print Type</th>

                          <td>
                            {printType}
                          </td>
                        </tr>

                        <tr>
                          <th>Printing Side</th>

                          <td>
                            {side}
                          </td>
                        </tr>

                        <tr>
                          <th>Paper Size</th>

                          <td>
                            {paperSize}
                          </td>
                        </tr>

                        <tr>
                          <th>Payment Status</th>

                          <td>
                            <span
                              className={`badge ${
                                order.paymentStatus ===
                                "Paid"
                                  ? "bg-success"
                                  : "bg-warning text-dark"
                              }`}
                            >
                              {order.paymentStatus ||
                                "Pending"}
                            </span>
                          </td>
                        </tr>

                        <tr>
                          <th>Print Status</th>

                          <td>
                            {order.status ||
                              "Pending"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {!isGuestPayment && (
                    <div className="row">
                      <div className="col-md-3 mb-3">
                        <label className="form-label">
                          Number of Copies
                        </label>

                        <input
                          type="number"
                          min="1"
                          max="999"
                          className="form-control"
                          value={copies}
                          onChange={(event) =>
                            setCopies(
                              Math.max(
                                Number(
                                  event.target
                                    .value
                                ) || 1,
                                1
                              )
                            )
                          }
                          disabled={
                            saving ||
                            order.paymentStatus ===
                              "Paid"
                          }
                        />
                      </div>

                      <div className="col-md-3 mb-3">
                        <label className="form-label">
                          Print Type
                        </label>

                        <select
                          className="form-select"
                          value={printType}
                          onChange={(event) =>
                            setPrintType(
                              event.target.value
                            )
                          }
                          disabled={
                            saving ||
                            order.paymentStatus ===
                              "Paid"
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

                      <div className="col-md-3 mb-3">
                        <label className="form-label">
                          Printing Side
                        </label>

                        <select
                          className="form-select"
                          value={side}
                          onChange={(event) =>
                            setSide(
                              event.target.value
                            )
                          }
                          disabled={
                            saving ||
                            order.paymentStatus ===
                              "Paid"
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

                      <div className="col-md-3 mb-3">
                        <label className="form-label">
                          Paper Size
                        </label>

                        <select
                          className="form-select"
                          value={paperSize}
                          onChange={(event) =>
                            setPaperSize(
                              event.target.value
                            )
                          }
                          disabled={
                            saving ||
                            order.paymentStatus ===
                              "Paid"
                          }
                        >
                          <option value="A4">
                            A4
                          </option>

                          <option value="A3">
                            A3
                          </option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="alert alert-info">
                    <div className="d-flex justify-content-between align-items-center">
                      <span>
                        Total Amount
                      </span>

                      <strong className="fs-4">
                        {quoting
                          ? "Calculating..."
                          : `${
                              paymentConfig.currencySymbol ||
                              "₹"
                            }${Number(
                              price || 0
                            ).toFixed(2)}`}
                      </strong>
                    </div>

                    <small>
                      The amount is calculated and
                      validated by the server.
                    </small>
                  </div>

                  {error && (
                    <div className="alert alert-danger">
                      {error}
                    </div>
                  )}

                  {paymentConfig.paymentInstructions && (
                    <div className="alert alert-secondary">
                      <strong>
                        Payment instructions:
                      </strong>{" "}
                      {
                        paymentConfig.paymentInstructions
                      }
                    </div>
                  )}

                  {!paymentConfig.paymentEnabled && (
                    <div className="alert alert-warning">
                      Payments are currently disabled
                      for this shop. Please contact
                      the shop.
                    </div>
                  )}

             {order.paymentStatus === "Paid" ? (
  <div className="text-center">
    <div className="alert alert-success">
      This order is already paid.
    </div>

    <button
      type="button"
      className="btn btn-success btn-lg"
      onClick={() =>
        finishPayment(order._id)
      }
    >
      Continue
    </button>
  </div>
) : (
  <>
    <div className="row g-3">
      {paymentConfig.razorpayAvailable && (
        <div className="col-md-4">
          <button
            type="button"
            className="btn btn-success btn-lg w-100"
            onClick={proceedRazorpayPayment}
            disabled={
              saving ||
              quoting ||
              !price ||
              !paymentConfig.paymentEnabled
            }
          >
            {saving
              ? "Processing..."
              : "Pay with Razorpay"}
          </button>
        </div>
      )}

      {paymentConfig.upiAvailable && (
        <div className="col-md-4">
          <button
            type="button"
            className="btn btn-primary btn-lg w-100"
            onClick={() =>
              setShowQr(
                (shown) => !shown
              )
            }
            disabled={
              saving ||
              quoting ||
              !price ||
              !paymentConfig.paymentEnabled
            }
          >
            {showQr
              ? "Hide UPI QR"
              : "Pay using UPI QR"}
          </button>
        </div>
      )}

      <div className="col-md-4">
        <button
          type="button"
          className="btn btn-dark btn-lg w-100"
          onClick={selectCashPayment}
          disabled={
            saving ||
            quoting ||
            !price
          }
        >
          {saving
            ? "Processing..."
            : "Pay at Shop / Cash"}
        </button>

        <div className="form-text text-center mt-2">
          Your order will print after the shop confirms the cash payment.
        </div>
      </div>
    </div>

    {paymentConfig.paymentEnabled &&
      !paymentConfig.razorpayAvailable &&
      !paymentConfig.upiAvailable && (
        <div className="alert alert-warning mt-3">
          This shop has not completed its online payment configuration.
          You can still choose Pay at Shop / Cash.
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
            Amount:{" "}
            {paymentConfig.currencySymbol}
            {Number(price).toFixed(2)}
          </h4>

          <p className="mb-1">
            <strong>UPI ID:</strong>{" "}
            {paymentConfig.upiId}
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
            onClick={
              confirmManualUpiPayment
            }
            disabled={saving}
          >
            I Have Paid
          </button>

          <div className="alert alert-warning mt-3 mb-0">
            UPI payments remain pending until the shop verifies the reference.
          </div>
        </div>
      </div>
    )}
  </>
)}
                  {isGuestPayment && (
                    <div className="text-center text-muted small mt-4">
                      Keep this page open until your
                      payment is completed.
                    </div>
                  )}
                </div>
          </div>
           </div>
            </div>
        </div>
      </div>
    </>
  );
}

export default Payment;
