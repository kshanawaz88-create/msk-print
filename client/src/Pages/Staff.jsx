import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import OrderProgress from "../components/OrderProgress";

const nextStatus = { Pending: "Printing", Printing: "Ready", Ready: "Completed" };

const paymentBadgeClass = (status) => {
  if (status === "Paid") return "success";
  if (["Rejected", "Failed"].includes(status)) return "danger";
  if (status === "Refunded") return "secondary";
  return "warning text-dark";
};

function Staff() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const response = await API.get("/api/print");
      setOrders(Array.isArray(response.data?.orders) ? response.data.orders : []);
      setError("");
    } catch (loadError) {
      setError(loadError.response?.data?.message || "Unable to load assigned orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const advance = async (order) => {
    const status = nextStatus[order.status];
    if (!status) return;

    if (order.paymentStatus !== "Paid") {
      setError("Payment must be Paid before this order can enter or advance in the print queue.");
      return;
    }

    try {
      setWorkingId(order._id);
      setError("");
      await API.put(`/api/print/${order._id}`, { status });
      await loadOrders();
    } catch (updateError) {
      setError(updateError.response?.data?.message || "Unable to update order");
    } finally {
      setWorkingId("");
    }
  };

  const reviewCashPayment = async (order, decision) => {
    const approving = decision === "approve";
    if (!window.confirm(
      approving
        ? "Confirm that cash has been received for this order?"
        : "Reject this pending cash payment? The order will remain unpaid."
    )) return;

    try {
      setWorkingId(order._id);
      setError("");
      const response = await API.patch(`/api/payment/cash/${order._id}/verify`, {
        decision,
        notes: approving ? "Cash received at shop" : "Cash payment rejected by staff",
      });
      if (!response.data?.success) {
        throw new Error(`Unable to ${approving ? "approve" : "reject"} this cash payment.`);
      }
      await loadOrders();
    } catch (cashError) {
      setError(
        cashError.response?.data?.message ||
          cashError.message ||
          `Unable to ${approving ? "approve" : "reject"} this cash payment.`
      );
    } finally {
      setWorkingId("");
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mt-4 mb-5">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
          <h2 className="mb-0">Staff Dashboard</h2>
          <button className="btn btn-success" type="button" onClick={loadOrders}>Refresh</button>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {loading ? (
          <div className="text-center py-5">Loading assigned work...</div>
        ) : orders.length === 0 ? (
          <div className="alert alert-info">No print work is currently assigned to you.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-bordered align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Customer / File</th>
                  <th>Print Details</th>
                  <th>Payment</th>
                  <th>Progress</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const busy = workingId === order._id;
                  const next = nextStatus[order.status];
                  return (
                    <tr key={order._id}>
                      <td>
                        <strong>{order.user?.fullName || order.customerName || "Guest"}</strong>
                        <div>{order.fileName || "Unnamed file"}</div>
                      </td>
                      <td>
                        {order.pages || 1} pages · {order.copies || 1} copies
                        <div className="small text-muted">
                          {order.printType || "Black & White"} · {order.side || "Single Side"} · {order.paperSize || "A4"}
                        </div>
                      </td>
                      <td style={{ minWidth: "180px" }}>
                        <span className={`badge bg-${paymentBadgeClass(order.paymentStatus)}`}>
                          Payment: {order.paymentStatus || "Pending"}
                        </span>
                        {order.paymentStatus === "Paid" && order.invoiceNumber && (
                          <div>
                            <Link className="btn btn-sm btn-outline-primary mt-2" to={`/invoice/${order._id}`}>
                              View Invoice
                            </Link>
                          </div>
                        )}
                        {order.paymentMethod === "Cash" && order.paymentStatus === "Pending" && (
                          <div className="d-flex gap-1 mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={busy}
                              onClick={() => reviewCashPayment(order, "approve")}
                            >
                              Approve Cash
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={busy}
                              onClick={() => reviewCashPayment(order, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                      <td><OrderProgress status={order.status} /></td>
                      <td>
                        {next ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy || order.paymentStatus !== "Paid"}
                              onClick={() => advance(order)}
                            >
                              {busy ? "Updating..." : `Mark ${next}`}
                            </button>
                            {order.paymentStatus !== "Paid" && (
                              <div className="small text-danger mt-1">Awaiting payment confirmation</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">No action available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default Staff;
