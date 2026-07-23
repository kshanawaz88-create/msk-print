import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import OrderProgress from "../components/OrderProgress";

const paymentBadge = (status) =>
  status === "Paid" ? "success" :
  ["Rejected", "Failed"].includes(status) ? "danger" :
  status === "Refunded" ? "secondary" : "warning text-dark";

function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    API.get("/api/print")
      .then((response) => setOrders(Array.isArray(response.data?.orders) ? response.data.orders : []))
      .catch((loadError) => setError(loadError.response?.data?.message || "Unable to load orders"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <div className="container mt-5 mb-5">
        <h2 className="mb-4">My Print Orders</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        {loading ? (
          <div className="text-center py-5">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="alert alert-info">You have not created any print orders yet.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-bordered table-hover align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Order</th><th>Print Settings</th><th>Price</th>
                  <th>Payment</th><th>Progress</th><th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>{order.fileName || "Unnamed file"}</strong>
                      <div className="small text-muted">{order.shopId?.shopName || "Shop unavailable"}</div>
                      {order.paymentStatus === "Paid" && (
                        <div className="small mt-1">Invoice: {order.invoiceNumber || "Generating"}</div>
                      )}
                      {order.paymentStatus === "Paid" && order.invoiceNumber && (
                        <Link className="btn btn-sm btn-outline-primary mt-2" to={`/invoice/${order._id}`}>
                          View Invoice
                        </Link>
                      )}
                    </td>
                    <td>
                      {order.pages || 0} pages · {order.copies || 1} copies
                      <div className="small text-muted">
                        {order.printType || "Black & White"} · {order.side || "Single Side"} · {order.paperSize || "A4"}
                      </div>
                    </td>
                    <td>₹{Number(order.price || 0).toFixed(2)}</td>
                    <td>
                      <span className={`badge bg-${paymentBadge(order.paymentStatus)}`}>
                        Payment: {order.paymentStatus || "Pending"}
                      </span>
                      <div className="small mt-1">{order.paymentMethod || "Method not selected"}</div>
                    </td>
                    <td><OrderProgress status={order.status} /></td>
                    <td>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</td>
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

export default MyOrders;
