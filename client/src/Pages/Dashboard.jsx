import React, { useEffect, useState } from "react";
import API from "../Services/Api";

function Dashboard() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    API.get("/api/print")
      .then((res) => {
        setOrders(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  const getBadge = (status) => {
    switch (status) {
      case "Pending":
        return "warning";
      case "Printing":
        return "primary";
      case "Ready":
        return "success";
      case "Completed":
        return "secondary";
      default:
        return "dark";
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4">📄 My Print Orders</h2>

      <table className="table table-hover table-bordered align-middle">
        <thead className="table-dark">
          <tr>
            <th>File</th>
            <th>Pages</th>
            <th>Copies</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>{order.fileName}</td>
              <td>{order.pages}</td>
              <td>{order.copies}</td>
              <td>₹{order.price}</td>
              <td>
                <span className={`badge bg-${getBadge(order.status)}`}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}

          {orders.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center">
                No orders found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Dashboard;