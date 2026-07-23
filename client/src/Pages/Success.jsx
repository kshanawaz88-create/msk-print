import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import API from "../Services/Api";
import socket from "../Services/socket";
import Navbar from "../components/Navbar";

function Success() {
  const navigate = useNavigate();

  const {
    shopCode,
    orderToken,
  } = useParams();

  const isGuestOrder = Boolean(
    shopCode && orderToken
  );

  const [order, setOrder] =
    useState(null);

  const [shop, setShop] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [socketConnected, setSocketConnected] =
    useState(false);

  // =====================================================
  // Load order and keep 5-second polling as backup
  // =====================================================

  useEffect(() => {
    let active = true;
    let requestRunning = false;

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
        null;

      return {
        order: orderData,
        shop: shopData,
      };
    };

    const loadAuthenticatedOrder =
      async () => {
        const savedId =
          localStorage.getItem(
            "completedJobId"
          ) ||
          localStorage.getItem(
            "currentOrderId"
          );

        if (savedId) {
          const response = await API.get(
            `/api/print/${encodeURIComponent(
              savedId
            )}`
          );

          const orderData =
            response.data?.job ||
            response.data;

          return {
            order: orderData,
            shop:
              orderData?.shopId ||
              null,
          };
        }

        const response = await API.get(
          "/api/print"
        );

        const latest = (
          response.data?.orders || []
        ).find(
          (job) =>
            job.paymentMethod ||
            job.paymentStatus === "Paid"
        );

        if (!latest) {
          throw new Error(
            "No submitted print order was found."
          );
        }

        localStorage.setItem(
          "completedJobId",
          latest._id
        );

        return {
          order: latest,
          shop: latest.shopId || null,
        };
      };

    const loadOrder = async (
      firstLoad = false
    ) => {
      if (requestRunning) {
        return;
      }

      requestRunning = true;

      try {
        if (firstLoad) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        const result =
          isGuestOrder
            ? await loadGuestOrder()
            : await loadAuthenticatedOrder();

        if (!active) {
          return;
        }

        if (!result.order) {
          throw new Error(
            "Unable to load this order."
          );
        }

        setOrder(result.order);
        setShop(result.shop);
        setError("");
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError.response?.data
            ?.message ||
            loadError.message ||
            "Unable to load order."
        );
      } finally {
        requestRunning = false;

        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadOrder(true);

    const refreshTimer = setInterval(
      () => {
        loadOrder(false);
      },
      5000
    );

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [
    isGuestOrder,
    orderToken,
    shopCode,
  ]);

  // =====================================================
  // Socket.IO live updates for guest orders
  // =====================================================

  useEffect(() => {
    if (
      !isGuestOrder ||
      !orderToken
    ) {
      return undefined;
    }

 const joinOrderRoom = () => {
  socket.emit(
    "join-public-order",
    {
      orderToken,
      shopCode,
    },
    (response) => {
      if (!response?.success) {
        console.warn(
          "Unable to join live order room:",
          response?.message
        );
      }
    }
  );
};
    const handleConnect = () => {
      setSocketConnected(true);
      joinOrderRoom();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleConnectError = (
      socketError
    ) => {
      console.warn(
        "Socket connection failed:",
        socketError.message
      );

      setSocketConnected(false);
    };

    const handleOrderUpdate = (
      updatedOrder
    ) => {
      if (
        !updatedOrder ||
        typeof updatedOrder !== "object"
      ) {
        return;
      }

      setOrder((currentOrder) => ({
        ...(currentOrder || {}),
        ...updatedOrder,
      }));

      if (
        updatedOrder.shop &&
        typeof updatedOrder.shop === "object"
      ) {
        setShop(updatedOrder.shop);
      }

      setLastUpdated(new Date());
      setError("");
    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "connect_error",
      handleConnectError
    );

    socket.on(
      "order-updated",
      handleOrderUpdate
    );

    if (!socket.connected) {
      socket.connect();
    } else {
      handleConnect();
    }

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "connect_error",
        handleConnectError
      );

      socket.off(
        "order-updated",
        handleOrderUpdate
      );

      socket.disconnect();
    };
 }, [
  isGuestOrder,
  orderToken,
  shopCode,
]);

  // =====================================================
  // Payment heading and message
  // =====================================================

  const paymentState = useMemo(() => {
    if (!order) {
      return {
        title: "",
        subtitle: "",
        headerClass:
          "bg-secondary text-white",
        alertClass:
          "alert-secondary",
        icon: "⏳",
      };
    }

    if (
      order.paymentStatus === "Paid"
    ) {
      let subtitle =
        "Your payment is verified and the order has entered the print queue.";

      if (
        order.status === "Printing"
      ) {
        subtitle =
          "Your document is currently being printed.";
      }

      if (order.status === "Ready") {
        subtitle =
          "Your print is ready for pickup.";
      }

      if (
        order.status === "Completed"
      ) {
        subtitle =
          "Your print order has been completed.";
      }

      return {
        title: "Payment Successful",
        subtitle,
        headerClass:
          "bg-success text-white",
        alertClass:
          "alert-success",
        icon: "✅",
      };
    }

    if (
      order.paymentMethod === "UPI" &&
      order.paymentStatus === "Pending"
    ) {
      return {
        title: "Payment Submitted",
        subtitle:
          "Your UPI transaction number was submitted and is waiting for shop verification.",
        headerClass:
          "bg-warning text-dark",
        alertClass:
          "alert-warning",
        icon: "⏳",
      };
    }

    if (
      order.paymentMethod === "Cash" &&
      order.paymentStatus === "Pending"
    ) {
      return {
        title: "Order Created",
        subtitle:
          "Please pay at the shop counter. Printing will begin after cash is received.",
        headerClass:
          "bg-info text-dark",
        alertClass:
          "alert-info",
        icon: "💵",
      };
    }

    if (
      order.paymentStatus === "Rejected"
    ) {
      return {
        title: "Payment Rejected",
        subtitle:
          "The shop could not verify this payment. Please contact the shop or use another payment method.",
        headerClass:
          "bg-danger text-white",
        alertClass:
          "alert-danger",
        icon: "❌",
      };
    }

    if (
      order.paymentStatus === "Failed"
    ) {
      return {
        title: "Payment Failed",
        subtitle:
          "The payment could not be completed. Please return to the payment page and try again.",
        headerClass:
          "bg-danger text-white",
        alertClass:
          "alert-danger",
        icon: "❌",
      };
    }

    return {
      title: "Order Submitted",
      subtitle:
        "Your order has been created and is waiting for payment.",
      headerClass:
        "bg-secondary text-white",
      alertClass:
        "alert-secondary",
      icon: "🧾",
    };
  }, [order]);

  // =====================================================
  // Progress steps
  // =====================================================

  const progressSteps = useMemo(() => {
    if (!order) {
      return [];
    }

    const paymentConfirmed =
      order.paymentStatus === "Paid";

    const sentToPrinter =
      paymentConfirmed &&
      [
        "Printing",
        "Ready",
        "Completed",
      ].includes(order.status);

    const printingFinished =
      [
        "Ready",
        "Completed",
      ].includes(order.status);

    return [
      {
        label: "Order Received",
        description:
          "Your document and print settings were received.",
        complete: true,
        active: false,
      },

      {
        label: "Payment Confirmed",
        description:
          order.paymentMethod === "UPI" &&
          order.paymentStatus === "Pending"
            ? "Waiting for the shop to verify your UPI transaction."
            : order.paymentMethod === "Cash" &&
              order.paymentStatus === "Pending"
            ? "Waiting for cash payment at the counter."
            : paymentConfirmed
            ? "Payment has been successfully confirmed."
            : "Waiting for payment.",
        complete: paymentConfirmed,
        active:
          order.paymentStatus ===
          "Pending",
      },

      {
        label: "Sent to Printer",
        description:
          sentToPrinter
            ? "The Print Agent has received your order."
            : "The paid order will be sent to the Print Agent.",
        complete: sentToPrinter,
        active:
          paymentConfirmed &&
          order.status === "Pending",
      },

      {
        label: "Printing",
        description:
          order.status === "Printing"
            ? "Your document is currently printing."
            : "Your document will be processed by the printer.",
        complete: printingFinished,
        active:
          order.status === "Printing",
      },

      {
        label: "Completed",
        description:
          order.status === "Completed"
            ? "Your print order has been completed."
            : order.status === "Ready"
            ? "Your print is ready for pickup."
            : "The completed print will be ready for collection.",
        complete:
          order.status === "Completed",
        active:
          order.status === "Ready",
      },
    ];
  }, [order]);

  const shopName =
    shop?.shopName ||
    order?.shop?.shopName ||
    order?.shopId?.shopName ||
    "MSK Print Cloud";

  const amountSymbol =
    order?.currency === "INR" ||
    !order?.currency
      ? "₹"
      : "";

  const paymentStatusClass = () => {
    if (
      order.paymentStatus === "Paid"
    ) {
      return "bg-success";
    }

    if (
      [
        "Rejected",
        "Failed",
        "Refunded",
      ].includes(
        order.paymentStatus
      )
    ) {
      return "bg-danger";
    }

    return "bg-warning text-dark";
  };

  const printStatusClass = () => {
    if (
      order.status === "Completed"
    ) {
      return "bg-success";
    }

    if (
      order.status === "Printing"
    ) {
      return "bg-primary";
    }

    if (order.status === "Ready") {
      return "bg-info text-dark";
    }

    if (
      [
        "Error",
        "Cancelled",
      ].includes(order.status)
    ) {
      return "bg-danger";
    }

    return "bg-secondary";
  };

  const createNewOrder = () => {
    if (isGuestOrder) {
      navigate(
        `/shop/${encodeURIComponent(
          shopCode
        )}`
      );

      return;
    }

    localStorage.removeItem(
      "printJobId"
    );

    localStorage.removeItem(
      "completedJobId"
    );

    localStorage.removeItem(
      "currentOrderId"
    );

    navigate("/upload");
  };

  const goToOrders = () => {
    if (isGuestOrder) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    navigate("/orders");
  };

  if (loading) {
    return (
      <>
        {!isGuestOrder && <Navbar />}

        <div className="container py-5 text-center">
          <div
            className="spinner-border text-success"
            role="status"
          />

          <h3 className="mt-3">
            Loading order...
          </h3>
        </div>
      </>
    );
  }

  if (error && !order) {
    return (
      <>
        {!isGuestOrder && <Navbar />}

        <div className="container py-5">
          <div className="alert alert-danger">
            {error}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              isGuestOrder
                ? navigate(
                    `/shop/${encodeURIComponent(
                      shopCode
                    )}`
                  )
                : navigate("/orders")
            }
          >
            Go Back
          </button>
        </div>
      </>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <>
      {!isGuestOrder && <Navbar />}

      <div
        style={{
          minHeight: "100vh",
          background: "#f4f6f9",
          paddingTop: isGuestOrder
            ? "30px"
            : "0",
        }}
      >
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-9">
              <div className="card shadow-lg border-0">
                <div
                  className={`card-header ${paymentState.headerClass}`}
                >
                  <h2 className="mb-0">
                    {paymentState.icon}{" "}
                    {paymentState.title}
                  </h2>
                </div>

                <div className="card-body p-4 p-md-5">
                  <div
                    className={`alert ${paymentState.alertClass}`}
                  >
                    <strong>
                      {paymentState.subtitle}
                    </strong>
                  </div>

                  {error && order && (
                    <div className="alert alert-warning">
                      Live status could not
                      refresh: {error}
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                    <div>
                      <h4 className="mb-1">
                        {shopName}
                      </h4>

                      {shopCode && (
                        <p className="text-muted mb-0">
                          Shop code:{" "}
                          {shopCode}
                        </p>
                      )}
                    </div>

                    <div className="text-end">
                      {isGuestOrder && (
                        <div className="mb-1">
                          <span
                            className={`badge ${
                              socketConnected
                                ? "bg-success"
                                : "bg-secondary"
                            }`}
                          >
                            {socketConnected
                              ? "Live updates connected"
                              : "Using backup refresh"}
                          </span>
                        </div>
                      )}

                      <div className="text-muted small">
                        {refreshing
                          ? "Refreshing status..."
                          : lastUpdated
                          ? `Updated at ${lastUpdated.toLocaleTimeString()}`
                          : ""}

                        <div>
                          Backup refresh every
                          five seconds
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h5 className="mb-4">
                        Order Progress
                      </h5>

                      {progressSteps.map(
                        (step, index) => (
                          <div
                            key={step.label}
                            className="d-flex align-items-start mb-4"
                          >
                            <div
                              className={`rounded-circle d-flex align-items-center justify-content-center me-3 ${
                                step.complete
                                  ? "bg-success text-white"
                                  : step.active
                                  ? "bg-primary text-white"
                                  : "bg-secondary text-white"
                              }`}
                              style={{
                                width: "40px",
                                height: "40px",
                                flexShrink: 0,
                              }}
                            >
                              {step.complete
                                ? "✓"
                                : index + 1}
                            </div>

                            <div>
                              <strong>
                                {step.label}
                              </strong>

                              {step.active && (
                                <span className="badge bg-primary ms-2">
                                  In progress
                                </span>
                              )}

                              <div className="text-muted small mt-1">
                                {
                                  step.description
                                }
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-bordered align-middle">
                      <tbody>
                        <tr>
                          <th
                            style={{
                              width: "35%",
                            }}
                          >
                            Order ID
                          </th>

                          <td>
                            {order._id ||
                              order.id}
                          </td>
                        </tr>

                        <tr>
                          <th>File Name</th>

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
                            {order.copies || 1}
                          </td>
                        </tr>

                        <tr>
                          <th>Print Type</th>

                          <td>
                            {order.printType ||
                              "Black & White"}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Printing Side
                          </th>

                          <td>
                            {order.side ||
                              "Single Side"}
                          </td>
                        </tr>

                        <tr>
                          <th>Paper Size</th>

                          <td>
                            {order.paperSize ||
                              "A4"}
                          </td>
                        </tr>

                        <tr>
                          <th>Amount</th>

                          <td>
                            <strong>
                              {amountSymbol}
                              {Number(
                                order.price || 0
                              ).toFixed(2)}
                            </strong>
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Payment Method
                          </th>

                          <td>
                            {order.paymentMethod ||
                              "Not selected"}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Payment Status
                          </th>

                          <td>
                            <span
                              className={`badge ${paymentStatusClass()}`}
                            >
                              {order.paymentStatus ||
                                "Pending"}
                            </span>
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Print Status
                          </th>

                          <td>
                            <span
                              className={`badge ${printStatusClass()}`}
                            >
                              {order.status ||
                                "Pending"}
                            </span>
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Invoice Number
                          </th>

                          <td>
                            {order.paymentStatus ===
                            "Paid"
                              ? order.invoiceNumber ||
                                "Generating..."
                              : "Available after payment confirmation"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {order.paymentStatus ===
                    "Paid" &&
                    order.invoiceNumber &&
                    !isGuestOrder && (
                      <button
                        type="button"
                        className="btn btn-outline-primary me-3 mb-2"
                        onClick={() =>
                          navigate(
                            `/invoice/${order._id}`
                          )
                        }
                      >
                        View Invoice
                      </button>
                    )}

                  <button
                    type="button"
                    className="btn btn-primary me-3 mb-2"
                    onClick={goToOrders}
                  >
                    Track Order
                  </button>

                  <button
                    type="button"
                    className="btn btn-success mb-2"
                    onClick={createNewOrder}
                  >
                    Create New Print Job
                  </button>

                  {isGuestOrder && (
                    <p className="text-muted small mt-4 mb-0">
                      Keep this page or save
                      this link until your
                      print is completed.
                    </p>
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

export default Success;