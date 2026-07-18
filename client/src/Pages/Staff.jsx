import React, { useEffect, useState } from "react";
import API from "../Services/Api";

function Staff() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();

    const interval = setInterval(() => {
      loadOrders();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    try {
      const res = await API.get("/api/print");
      setOrders(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await API.put(`/api/print/${id}`, {
        status,
      });

      loadOrders();
    } catch (err) {
      console.log(err);
    }
  };

  const pending = orders.filter(
    (o) => o.status === "Pending"
  ).length;

  const printing = orders.filter(
    (o) => o.status === "Printing"
  ).length;

  const ready = orders.filter(
    (o) => o.status === "Ready"
  ).length;

  const completed = orders.filter(
    (o) => o.status === "Completed"
  ).length;

  return (
    <div className="container mt-4">

      <h2 className="mb-4">
        👨‍💼 Staff Dashboard
      </h2>

      <div className="row mb-4">

        <div className="col-md-3">
          <div className="card bg-warning text-white shadow">
            <div className="card-body text-center">
              <h3>{pending}</h3>
              <p>Pending</p>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-primary text-white shadow">
            <div className="card-body text-center">
              <h3>{printing}</h3>
              <p>Printing</p>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-info text-white shadow">
            <div className="card-body text-center">
              <h3>{ready}</h3>
              <p>Ready</p>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-success text-white shadow">
            <div className="card-body text-center">
              <h3>{completed}</h3>
              <p>Completed</p>
            </div>
          </div>
        </div>

      </div>

      <div className="card shadow">

        <div className="card-header">
          <h5>Assigned Orders</h5>
        </div>

        <div className="card-body">

          <table className="table table-bordered">

            <thead>

              <tr>
                <th>Customer</th>
                <th>File</th>
                <th>Pages</th>
                <th>Status</th>
                <th>Update</th>
              </tr>

            </thead>

            <tbody>

              {orders.length === 0 ? (

                <tr>
                  <td
                    colSpan="5"
                    className="text-center"
                  >
                    No Orders Assigned
                  </td>
                </tr>

              ) : (

                orders.map((order) => (

                  <tr key={order._id}>

                    <td>
                      {order.user?.fullName}
                    </td>

                    <td>{order.fileName}</td>

                    <td>{order.pages}</td>

                    <td>{order.status}</td>

                    <td>

                      <select
                        className="form-select"
                        value={order.status}
                        onChange={(e) =>
                          updateStatus(
                            order._id,
                            e.target.value
                          )
                        }
                      >
                        <option>Pending</option>
                        <option>Printing</option>
                        <option>Ready</option>
                        <option>Completed</option>
                      </select>

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default Staff;