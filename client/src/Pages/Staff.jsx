import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import OrderProgress from "../components/OrderProgress";

const nextStatus = { Pending: "Printing", Printing: "Ready", Ready: "Completed" };

function Staff() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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
    try {
      await API.put(`/api/print/${order._id}`, { status });
      await loadOrders();
    } catch (updateError) {
      setError(updateError.response?.data?.message || "Unable to update order");
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mt-4 mb-5">
        <h2 className="mb-4">Staff Dashboard</h2>
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
                  <th>Customer / File</th><th>Print Details</th><th>Payment</th>
                  <th>Progress</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>{order.user?.fullName || "Customer"}</strong>
                      <div>{order.fileName}</div>
                    </td>
                    <td>
                      {order.pages} pages · {order.copies} copies
                      <div className="small text-muted">
                        {order.printType} · {order.side} · {order.paperSize}
                      </div>
                    </td>
                    <td>
                      <span className={`badge bg-${order.paymentStatus === "Paid" ? "success" : "warning text-dark"}`}>
                        Payment: {order.paymentStatus}
                      </span>
                      {order.paymentStatus === "Paid" && order.invoiceNumber && (
                        <div><Link className="btn btn-sm btn-outline-primary mt-2" to={`/invoice/${order._id}`}>View Invoice</Link></div>
                      )}
                    </td>
                    <td><OrderProgress status={order.status} /></td>
                    <td>
                      {nextStatus[order.status] ? (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={nextStatus[order.status] === "Completed" && order.paymentStatus !== "Paid"}
                          onClick={() => advance(order)}
                        >
                          Mark {nextStatus[order.status]}
                        </button>
                      ) : <span className="text-muted">No action available</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default Staff;
