import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import DashboardCards from "../components/DashboardCards";
import RevenueChart from "../components/RevenueChart";
import StatusChart from "../components/StatusChart";
import OrderProgress from "../components/OrderProgress";

const transitions = {
  Pending: ["Printing", "Cancelled"],
  Printing: ["Ready", "Cancelled"],
  Ready: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
  Error: [],
};

const requiresPaidOrder = (status) =>
  ["Printing", "Ready", "Completed"].includes(status);

const paymentBadgeClass = (status) => {
  if (status === "Paid") return "success";
  if (["Rejected", "Failed"].includes(status)) return "danger";
  if (status === "Refunded") return "secondary";
  return "warning text-dark";
};

function ShopOwner() {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const ordersResponse = await API.get("/api/print");
      setOrders(Array.isArray(ordersResponse.data?.orders) ? ordersResponse.data.orders : []);

      try {
        const staffResponse = await API.get("/api/users/staff");
        setStaff(Array.isArray(staffResponse.data?.staff) ? staffResponse.data.staff : []);
      } catch {
        setStaff([]);
      }

      setError("");
    } catch (loadError) {
      setError(loadError.response?.data?.message || "Unable to load shop orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const updateOrder = async (order, update) => {
    if (
      update.status &&
      requiresPaidOrder(update.status) &&
      order.paymentStatus !== "Paid"
    ) {
      setError("Payment must be Paid before this order can enter or advance in the print queue.");
      return;
    }

    if (
      update.status &&
      ["Cancelled", "Completed"].includes(update.status) &&
      !window.confirm(`Change this order's status to ${update.status}?`)
    ) {
      return;
    }

    try {
      setWorkingId(order._id);
      setError("");
      await API.put(`/api/print/${order._id}`, update);
      await loadData();
    } catch (updateError) {
      setError(updateError.response?.data?.message || "Unable to update order");
    } finally {
      setWorkingId("");
    }
  };

  const reviewUpiPayment = async (order, decision) => {
    const action = decision === "approve" ? "approve" : "reject";
    if (!window.confirm(`Confirm that you want to ${action} this UPI payment?`)) return;

    try {
      setWorkingId(order._id);
      setError("");
      const response = await API.patch(`/api/payment/upi/${order._id}/verify`, { decision });
      if (!response.data?.success) throw new Error(`Unable to ${action} this UPI payment.`);
      await loadData();
    } catch (reviewError) {
      setError(
        reviewError.response?.data?.message ||
          reviewError.message ||
          `Unable to ${action} this UPI payment.`
      );
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
        notes: approving ? "Cash received at shop" : "Cash payment rejected by shop owner",
      });
      if (!response.data?.success) {
        throw new Error(`Unable to ${approving ? "approve" : "reject"} this cash payment.`);
      }
      await loadData();
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
      <div className="container-fluid mt-4 mb-5">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
          <div>
            <h2>Shop Owner Dashboard</h2>
            <p className="text-muted">Manage your shop orders and paid revenue</p>
          </div>
          <button className="btn btn-success" type="button" onClick={loadData}>Refresh</button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row"><DashboardCards orders={orders} /></div>
        <div className="row mt-4">
          <div className="col-lg-8"><RevenueChart orders={orders} /></div>
          <div className="col-lg-4"><StatusChart orders={orders} /></div>
        </div>

        <div className="card shadow mt-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">Shop Orders</h5>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="text-center py-4">Loading shop orders...</div>
            ) : orders.length === 0 ? (
              <div className="alert alert-info mb-0">No orders have been placed with this shop.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Customer / File</th>
                      <th>Print Details</th>
                      <th>Payment</th>
                      <th>Progress</th>
                      <th>Assigned Staff</th>
                      <th>Update Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const busy = workingId === order._id;
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
                          <td style={{ minWidth: "210px" }}>
                            <span className={`badge bg-${paymentBadgeClass(order.paymentStatus)}`}>
                              {order.paymentStatus || "Pending"}
                            </span>
                            <div>₹{Number(order.price || 0).toFixed(2)}</div>
                            {order.upiReference && <div className="small text-muted">UPI ref: {order.upiReference}</div>}
                            {order.paymentStatus === "Paid" && order.invoiceNumber && (
                              <Link className="btn btn-sm btn-outline-primary mt-1" to={`/invoice/${order._id}`}>
                                View Invoice
                              </Link>
                            )}
                            {order.paymentMethod === "UPI" && order.paymentStatus === "Pending" && (
                              <div className="d-flex gap-1 mt-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  disabled={busy}
                                  onClick={() => reviewUpiPayment(order, "approve")}
                                >
                                  Approve UPI
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  disabled={busy}
                                  onClick={() => reviewUpiPayment(order, "reject")}
                                >
                                  Reject
                                </button>
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
                            <select
                              className="form-select"
                              value={order.assignedStaff?._id || ""}
                              disabled={busy}
                              onChange={(event) => updateOrder(order, { assignedStaff: event.target.value })}
                            >
                              <option value="">Unassigned</option>
                              {staff.map((member) => (
                                <option key={member._id} value={member._id}>{member.fullName}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="form-select"
                              value=""
                              disabled={busy || !transitions[order.status]?.length}
                              onChange={(event) => event.target.value && updateOrder(order, { status: event.target.value })}
                            >
                              <option value="">Choose...</option>
                              {(transitions[order.status] || []).map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={requiresPaidOrder(status) && order.paymentStatus !== "Paid"}
                                >
                                  {status}
                                </option>
                              ))}
                            </select>
                            {order.paymentStatus !== "Paid" && order.status === "Pending" && (
                              <div className="small text-danger mt-1">Awaiting payment confirmation</div>
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
        </div>
      </div>
    </>
  );
}

export default ShopOwner;
