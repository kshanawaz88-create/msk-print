import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../Services/Api";
import { createTrackingSocket } from "../Services/socket";
import { getStoredUser } from "../Services/session";
import Navbar from "../components/Navbar";

const paymentBadgeClass = (status) => {
  if (status === "Paid") return "bg-success";
  if (["Rejected", "Failed", "Refunded"].includes(status)) return "bg-danger";
  return "bg-warning text-dark";
};

const printBadgeClass = (status) => {
  if (status === "Completed") return "bg-success";
  if (status === "Printing") return "bg-primary";
  if (status === "Ready") return "bg-info text-dark";
  if (["Error", "Cancelled"].includes(status)) return "bg-danger";
  return "bg-secondary";
};

const normalizedId = (value) =>
  typeof value === "object" ? value?._id || value?.id || "" : value || "";

function Success() {
  const navigate = useNavigate();
  const { shopCode, orderToken } = useParams();
  const isGuestOrder = Boolean(shopCode && orderToken);
  const socket = useMemo(() => createTrackingSocket(), []);
  const orderIdRef = useRef("");

  const [order, setOrder] = useState(null);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let requestRunning = false;

    const loadGuestOrder = async () => {
      const response = await API.get(
        `/api/public/orders/${encodeURIComponent(orderToken)}`,
        { params: { shopCode } }
      );
      const orderData = response.data?.order || response.data?.job;
      return {
        order: orderData,
        shop: response.data?.shop || orderData?.shop || null,
      };
    };

    const loadAuthenticatedOrder = async () => {
      const savedId =
        localStorage.getItem("completedJobId") ||
        localStorage.getItem("currentOrderId");

      if (savedId) {
        const response = await API.get(`/api/print/${encodeURIComponent(savedId)}`);
        const orderData = response.data?.job || response.data;
        return { order: orderData, shop: orderData?.shopId || null };
      }

      const response = await API.get("/api/print");
      const currentUser = getStoredUser();
      const currentUserId = normalizedId(currentUser?.id || currentUser?._id);
      const available = Array.isArray(response.data?.orders) ? response.data.orders : [];
      const latest = [...available]
        .filter((job) => {
          const ownerId = normalizedId(job.user);
          return (!currentUserId || ownerId === currentUserId) &&
            (job.paymentMethod || job.paymentStatus === "Paid");
        })
        .sort((left, right) => {
          const byDate = new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
          return byDate || String(right._id || "").localeCompare(String(left._id || ""));
        })[0];

      if (!latest) throw new Error("No submitted print order was found.");
      localStorage.setItem("completedJobId", latest._id);
      return { order: latest, shop: latest.shopId || null };
    };

    const loadOrder = async (firstLoad = false) => {
      if (requestRunning) return;
      requestRunning = true;

      try {
        firstLoad ? setLoading(true) : setRefreshing(true);
        const result = isGuestOrder
          ? await loadGuestOrder()
          : await loadAuthenticatedOrder();

        if (!active) return;
        if (!result.order) throw new Error("Unable to load this order.");
        orderIdRef.current = normalizedId(result.order);
        setOrder(result.order);
        setShop(result.shop);
        setError("");
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError.response?.data?.message ||
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
    const refreshTimer = setInterval(() => loadOrder(false), 5000);
    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [isGuestOrder, orderToken, shopCode]);

  useEffect(() => {
    if (!isGuestOrder || !orderToken) return undefined;

    const joinOrderRoom = () => {
      socket.emit("join-public-order", { orderToken, shopCode }, (response) => {
        if (!response?.success) setSocketConnected(false);
      });
    };

    const handleConnect = () => {
      setSocketConnected(true);
      joinOrderRoom();
    };
    const handleDisconnect = () => setSocketConnected(false);
    const handleConnectError = () => setSocketConnected(false);
    const handleOrderUpdate = (updatedOrder) => {
      if (!updatedOrder || typeof updatedOrder !== "object") return;
      const updatedId = normalizedId(updatedOrder);
      if (orderIdRef.current && updatedId && updatedId !== orderIdRef.current) return;
      if (updatedId) orderIdRef.current = updatedId;
      setOrder((currentOrder) => ({ ...(currentOrder || {}), ...updatedOrder }));
      if (updatedOrder.shop && typeof updatedOrder.shop === "object") {
        setShop(updatedOrder.shop);
      }
      setLastUpdated(new Date());
      setError("");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("order-updated", handleOrderUpdate);
    socket.connected ? handleConnect() : socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("order-updated", handleOrderUpdate);
      socket.disconnect();
    };
  }, [isGuestOrder, orderToken, shopCode, socket]);

  const paymentState = useMemo(() => {
    if (!order) return { title: "", subtitle: "", header: "bg-secondary text-white", alert: "alert-secondary", icon: "⏳" };

    if (order.status === "Cancelled") {
      return {
        title: "Order Cancelled",
        subtitle: order.paymentStatus === "Paid"
          ? "This paid order was cancelled. Contact the shop about fulfillment or refund status."
          : "This order has been cancelled and will not be printed.",
        header: "bg-danger text-white",
        alert: "alert-danger",
        icon: "✕",
      };
    }
    if (order.status === "Error") {
      return {
        title: "Printing Problem",
        subtitle: order.errorReason || "The shop encountered a printing problem and will review this order.",
        header: "bg-danger text-white",
        alert: "alert-danger",
        icon: "!",
      };
    }
    if (order.paymentStatus === "Rejected") {
      return {
        title: "Payment Rejected",
        subtitle: "The shop could not verify this payment. Contact the shop for the next step.",
        header: "bg-danger text-white",
        alert: "alert-danger",
        icon: "✕",
      };
    }
    if (order.paymentStatus === "Failed") {
      return {
        title: "Payment Failed",
        subtitle: "The payment could not be completed. Return to the payment page to retry the same method.",
        header: "bg-danger text-white",
        alert: "alert-danger",
        icon: "✕",
      };
    }
    if (order.paymentStatus === "Refunded") {
      return {
        title: "Payment Refunded",
        subtitle: "This payment has been refunded. Contact the shop if you need assistance.",
        header: "bg-secondary text-white",
        alert: "alert-secondary",
        icon: "↩",
      };
    }
    if (order.paymentStatus === "Paid") {
      const subtitles = {
        Printing: "Your document is currently being printed.",
        Ready: "Your print is ready for pickup.",
        Completed: "Your print order has been completed.",
      };
      return {
        title: order.status === "Ready" ? "Ready for Pickup" : "Payment Confirmed",
        subtitle: subtitles[order.status] || "Your payment is verified and the order has entered the print queue.",
        header: "bg-success text-white",
        alert: "alert-success",
        icon: "✓",
      };
    }
    if (order.paymentMethod === "UPI") {
      return {
        title: "Payment Submitted",
        subtitle: "Your UPI transaction reference is waiting for shop verification.",
        header: "bg-warning text-dark",
        alert: "alert-warning",
        icon: "⏳",
      };
    }
    if (order.paymentMethod === "Cash") {
      return {
        title: "Order Created",
        subtitle: "Please pay at the shop counter. Printing begins only after cash is confirmed.",
        header: "bg-info text-dark",
        alert: "alert-info",
        icon: "₹",
      };
    }
    return {
      title: "Order Submitted",
      subtitle: "Your order has been created and is waiting for payment.",
      header: "bg-secondary text-white",
      alert: "alert-secondary",
      icon: "⏳",
    };
  }, [order]);

  const progressSteps = useMemo(() => {
    if (!order) return [];
    const paid = order.paymentStatus === "Paid";
    const terminal = ["Error", "Cancelled"].includes(order.status);
    const sent = paid && (["Printing", "Ready", "Completed"].includes(order.status) || Boolean(order.printStartedAt));
    const printed = ["Ready", "Completed"].includes(order.status);
    return [
      { label: "Order Received", description: "Your document and print settings were received.", complete: true },
      {
        label: "Payment Confirmed",
        description: paid
          ? "Payment has been confirmed."
          : order.paymentMethod === "UPI"
          ? "Waiting for UPI verification."
          : order.paymentMethod === "Cash"
          ? "Waiting for cash confirmation."
          : "Waiting for payment.",
        complete: paid,
        active: !terminal && order.paymentStatus === "Pending",
      },
      {
        label: "Sent to Printer",
        description: sent ? "The Print Agent received this order." : "A paid order will be sent to the Print Agent.",
        complete: sent,
        active: !terminal && paid && order.status === "Pending",
      },
      {
        label: "Printing",
        description: order.status === "Printing" ? "Your document is currently printing." : "The shop will process your document.",
        complete: printed,
        active: !terminal && order.status === "Printing",
      },
      {
        label: "Ready or Completed",
        description: order.status === "Completed"
          ? "Your print order has been completed."
          : order.status === "Ready"
          ? "Your print is ready for pickup."
          : "The shop will mark the order ready or completed.",
        complete: order.status === "Completed",
        active: !terminal && order.status === "Ready",
      },
    ];
  }, [order]);

  const createNewOrder = () => {
    if (isGuestOrder) {
      navigate(`/shop/${encodeURIComponent(shopCode)}`);
      return;
    }
    localStorage.removeItem("printJobId");
    localStorage.removeItem("completedJobId");
    localStorage.removeItem("currentOrderId");
    navigate("/upload");
  };

  const copyTrackingLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Tracking link copied.");
      window.setTimeout(() => setMessage(""), 2500);
    } catch {
      setError("Unable to copy the tracking link. Copy it from the browser address bar instead.");
    }
  };

  if (loading) {
    return (
      <>
        {!isGuestOrder && <Navbar />}
        <div className="container py-5 text-center">
          <div className="spinner-border text-success" role="status" />
          <h3 className="mt-3">Loading order...</h3>
        </div>
      </>
    );
  }

  if (!order) {
    return (
      <>
        {!isGuestOrder && <Navbar />}
        <div className="container py-5">
          <div className="alert alert-danger">{error || "Unable to load order."}</div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => isGuestOrder
              ? navigate(`/shop/${encodeURIComponent(shopCode)}`)
              : navigate("/orders")}
          >
            Go Back
          </button>
        </div>
      </>
    );
  }

  const shopName =
    shop?.shopName || order.shop?.shopName || order.shopId?.shopName || "MSK Print Cloud";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: order.currency || "INR",
  }).format(Number(order.price || 0));
  const queuePosition = Number(order.queuePosition);
  const estimatedWait = Number(order.estimatedWaitMinutes ?? order.estimatedTime);

  return (
    <>
      {!isGuestOrder && <Navbar />}
      <div style={{ minHeight: "100vh", background: "#f4f6f9", paddingTop: isGuestOrder ? "30px" : 0 }}>
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-9">
              <div className="card shadow-lg border-0">
                <div className={`card-header ${paymentState.header}`}>
                  <h2 className="mb-0">{paymentState.icon} {paymentState.title}</h2>
                </div>
                <div className="card-body p-4 p-md-5">
                  <div className={`alert ${paymentState.alert}`}><strong>{paymentState.subtitle}</strong></div>
                  {message && <div className="alert alert-success">{message}</div>}
                  {error && <div className="alert alert-warning">Status refresh issue: {error}</div>}

                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                    <div>
                      <h4 className="mb-1">{shopName}</h4>
                      {shopCode && <p className="text-muted mb-0">Shop code: {shopCode}</p>}
                    </div>
                    <div className="text-end">
                      {isGuestOrder && (
                        <span className={`badge ${socketConnected ? "bg-success" : "bg-secondary"}`}>
                          {socketConnected ? "Live updates connected" : "Using backup refresh"}
                        </span>
                      )}
                      <div className="text-muted small mt-1">
                        {refreshing
                          ? "Refreshing status..."
                          : lastUpdated
                          ? `Updated at ${lastUpdated.toLocaleTimeString()}`
                          : ""}
                        <div>Backup refresh every five seconds</div>
                      </div>
                    </div>
                  </div>

                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h5 className="mb-4">Order Progress</h5>
                      {progressSteps.map((step, index) => (
                        <div key={step.label} className="d-flex align-items-start mb-4">
                          <div
                            className={`rounded-circle d-flex align-items-center justify-content-center me-3 ${
                              step.complete ? "bg-success text-white" : step.active ? "bg-primary text-white" : "bg-secondary text-white"
                            }`}
                            style={{ width: "40px", height: "40px", flexShrink: 0 }}
                          >
                            {step.complete ? "✓" : index + 1}
                          </div>
                          <div>
                            <strong>{step.label}</strong>
                            {step.active && <span className="badge bg-primary ms-2">In progress</span>}
                            <div className="text-muted small mt-1">{step.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-bordered align-middle">
                      <tbody>
                        <tr><th style={{ width: "35%" }}>Order ID</th><td>{order._id || order.id}</td></tr>
                        <tr><th>File Name</th><td>{order.fileName || "Unnamed file"}</td></tr>
                        <tr><th>Pages</th><td>{order.pages || 1}</td></tr>
                        <tr><th>Copies</th><td>{order.copies || 1}</td></tr>
                        <tr><th>Print Type</th><td>{order.printType || "Black & White"}</td></tr>
                        <tr><th>Printing Side</th><td>{order.side || "Single Side"}</td></tr>
                        <tr><th>Paper Size</th><td>{order.paperSize || "A4"}</td></tr>
                        <tr><th>Amount</th><td><strong>{amount}</strong></td></tr>
                        <tr><th>Payment Method</th><td>{order.paymentMethod || "Not selected"}</td></tr>
                        <tr>
                          <th>Payment Status</th>
                          <td><span className={`badge ${paymentBadgeClass(order.paymentStatus)}`}>{order.paymentStatus || "Pending"}</span></td>
                        </tr>
                        <tr>
                          <th>Print Status</th>
                          <td><span className={`badge ${printBadgeClass(order.status)}`}>{order.status || "Pending"}</span></td>
                        </tr>
                        {order.status === "Error" && order.errorReason && (
                          <tr><th>Error Details</th><td className="text-danger">{order.errorReason}</td></tr>
                        )}
                        <tr><th>Queue Position</th><td>{queuePosition > 0 ? queuePosition : "Not currently queued"}</td></tr>
                        <tr><th>Estimated Wait</th><td>{estimatedWait > 0 ? `${estimatedWait} minutes` : "Not available"}</td></tr>
                        <tr>
                          <th>Invoice Number</th>
                          <td>{order.paymentStatus === "Paid" ? order.invoiceNumber || "Available on request" : "Available after payment confirmation"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {order.paymentStatus === "Paid" && order.invoiceNumber && !isGuestOrder && (
                    <button type="button" className="btn btn-outline-primary me-2 mb-2" onClick={() => navigate(`/invoice/${order._id}`)}>
                      View Invoice
                    </button>
                  )}
                  {!isGuestOrder && (
                    <button type="button" className="btn btn-primary me-2 mb-2" onClick={() => navigate("/orders")}>
                      My Orders
                    </button>
                  )}
                  {isGuestOrder && (
                    <button type="button" className="btn btn-outline-primary me-2 mb-2" onClick={copyTrackingLink}>
                      Copy Tracking Link
                    </button>
                  )}
                  <button type="button" className="btn btn-success mb-2" onClick={createNewOrder}>
                    Create New Print Job
                  </button>

                  {isGuestOrder && (
                    <p className="text-muted small mt-4 mb-0">
                      Save this private tracking link until your print is completed. Anyone with the link can view this order.
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
