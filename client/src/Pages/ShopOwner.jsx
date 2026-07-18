import React, { useEffect, useState } from "react";
import API from "../Services/Api";

import Navbar from "../components/Navbar";
import DashboardCards from "../components/DashboardCards";
import RevenueChart from "../components/RevenueChart";
import StatusChart from "../components/StatusChart";
import RecentOrders from "../components/RecentOrders";

function ShopOwner() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();

    const interval = setInterval(() => {
      loadOrders();
    }, 10000);

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

  return (
    <>
      <Navbar />

      <div className="container-fluid mt-4">

        <div className="d-flex justify-content-between align-items-center mb-4">

          <div>
            <h2>🏪 Shop Owner Dashboard</h2>

            <p className="text-muted">
              Manage your shop orders and revenue
            </p>
          </div>

          <button
            className="btn btn-success"
            onClick={loadOrders}
          >
            Refresh
          </button>

        </div>

        <DashboardCards orders={orders} />

        <div className="row mt-4">

          <div className="col-lg-8">
            <RevenueChart orders={orders} />
          </div>

          <div className="col-lg-4">
            <StatusChart orders={orders} />
          </div>

        </div>

        <div className="mt-4">

          <RecentOrders
            orders={orders.slice(0,10)}
          />

        </div>
              <div className="card shadow mt-4">

          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">📦 Shop Orders</h5>
          </div>

          <div className="card-body">

            <table className="table table-hover">

              <thead className="table-light">

                <tr>
                  <th>Customer</th>
                  <th>File</th>
                  <th>Pages</th>
                  <th>Copies</th>
                  <th>Status</th>
                  <th>Price</th>
                </tr>

              </thead>

              <tbody>

                {orders.length === 0 ? (

                  <tr>
                    <td
                      colSpan="6"
                      className="text-center"
                    >
                      No Orders Found
                    </td>
                  </tr>

                ) : (

                  orders.map((order) => (

                    <tr key={order._id}>

                      <td>
                        {order.user?.fullName || "N/A"}
                      </td>

                      <td>{order.fileName}</td>

                      <td>{order.pages}</td>

                      <td>{order.copies}</td>

                      <td>

                        <span
                          className={`badge ${
                            order.status === "Completed"
                              ? "bg-success"
                              : order.status === "Printing"
                              ? "bg-primary"
                              : order.status === "Ready"
                              ? "bg-info"
                              : "bg-warning"
                          }`}
                        >
                          {order.status}
                        </span>

                      </td>

                      <td>
                        ₹{order.price}
                      </td>

                    </tr>

                  ))

                )}

              </tbody>

            </table>

          </div>

        </div>
              </div>

    </>
  );
}

export default ShopOwner;