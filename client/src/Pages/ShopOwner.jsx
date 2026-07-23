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
};

function ShopOwner() {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [ordersResponse, staffResponse] = await Promise.all([
        API.get("/api/print"),
        API.get("/api/users/staff"),
      ]);
      setOrders(Array.isArray(ordersResponse.data?.orders) ? ordersResponse.data.orders : []);
      setStaff(Array.isArray(staffResponse.data?.staff) ? staffResponse.data.staff : []);
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

  const updateOrder = async (id, update) => {
    try {
      await API.put(`/api/print/${id}`, update);
      await loadData();
    } catch (updateError) {
      setError(updateError.response?.data?.message || "Unable to update order");
    }
  };

  return (
    <>
      <Navbar />
      <div className="container-fluid mt-4 mb-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h2>Shop Owner Dashboard</h2>
            <p className="text-muted">Manage your shop orders and paid revenue</p>
          </div>
          <button className="btn btn-success" onClick={loadData}>Refresh</button>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row"><DashboardCards orders={orders} /></div>
        <div className="row mt-4">
          <div className="col-lg-8"><RevenueChart orders={orders} /></div>
          <div className="col-lg-4"><StatusChart orders={orders} /></div>
        </div>
        <div className="card shadow mt-4">
          <div className="card-header bg-primary text-white"><h5 className="mb-0">Shop Orders</h5></div>
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
                      <th>Customer / File</th><th>Print Details</th><th>Payment</th>
                      <th>Progress</th><th>Assigned Staff</th><th>Update Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order._id}>
                        <td><strong>{order.user?.fullName || "Customer"}</strong><div>{order.fileName}</div></td>
                        <td>{order.pages} pages · {order.copies} copies<div className="small text-muted">{order.printType} · {order.side} · {order.paperSize}</div></td>
                        <td>
                          <span className={`badge bg-${order.paymentStatus === "Paid" ? "success" : "warning text-dark"}`}>{order.paymentStatus}</span>
                          <div>₹{Number(order.price || 0).toFixed(2)}</div>
                          {order.paymentStatus === "Paid" && order.invoiceNumber && (
                            <Link className="btn btn-sm btn-outline-primary mt-1" to={`/invoice/${order._id}`}>View Invoice</Link>
                          )}
                        </td>
                        <td><OrderProgress status={order.status} /></td>
                        <td>
                          <select className="form-select" value={order.assignedStaff?._id || ""} onChange={(e) => updateOrder(order._id, { assignedStaff: e.target.value })}>
                            <option value="">Unassigned</option>
                            {staff.map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            value=""
                            disabled={!transitions[order.status]?.length}
                            onChange={(e) => e.target.value && updateOrder(order._id, { status: e.target.value })}
                          >
                            <option value="">Choose...</option>
                            {(transitions[order.status] || []).map((status) => (
                              <option key={status} value={status} disabled={status === "Completed" && order.paymentStatus !== "Paid"}>{status}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
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
