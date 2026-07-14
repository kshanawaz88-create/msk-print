import React, { useEffect, useState } from "react";
import API from "../Services/Api";

function Admin() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const response = await API.get("/api/print");
      setOrders(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await API.put(`/api/print/${id}`, {
        status,
      });

      loadOrders();
    } catch (error) {
      console.log(error);
    }
  };

  const badgeColor = (status) => {
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
      <h2 className="mb-4">🖨️ MSK Print Admin Dashboard</h2>

      <table className="table table-bordered table-hover">
        <thead className="table-dark">
          <tr>
            <th>File</th>
            <th>Pages</th>
            <th>Copies</th>
            <th>Price</th>
            <th>Status</th>
            <th>Change Status</th>
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
                <span className={`badge bg-${badgeColor(order.status)}`}>
                  {order.status}
                </span>
              </td>

              <td>
                <select
                  className="form-select"
                  value={order.status}
                  onChange={(e) =>
                    updateStatus(order._id, e.target.value)
                  }
                >
                  <option>Pending</option>
                  <option>Printing</option>
                  <option>Ready</option>
                  <option>Completed</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Admin;