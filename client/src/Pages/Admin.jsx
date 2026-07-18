import React, { useEffect, useState } from "react";
import API from "../Services/Api";

import Navbar from "../components/Navbar";
import DashboardCards from "../components/DashboardCards";
import RevenueChart from "../components/RevenueChart";
import StatusChart from "../components/StatusChart";
import RecentOrders from "../components/RecentOrders";
import ExportExcel from "../components/ExportExcel";
import KPICards from "../components/KPICards";
import PrintQueue from "../components/PrintQueue";

function Admin() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    loadOrders();

    const interval = setInterval(() => {
      loadOrders();
    }, 10000);

    return () => clearInterval(interval);
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
        return "info";
      case "Completed":
        return "success";
      case "Cancelled":
        return "danger";
      default:
        return "secondary";
    }
  };

  const filteredOrders = orders.filter((order) => {
    const fileName = order.fileName?.toLowerCase() || "";
    const customerName =
      order.user?.fullName?.toLowerCase() || "";

    const matchesSearch =
      fileName.includes(search.toLowerCase()) ||
      customerName.includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" ||
      order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <Navbar />

      <div className="container-fluid mt-4">

        <div className="d-flex justify-content-between align-items-center mb-4">

          <div>
            <h2 className="fw-bold">
              📊 Admin Dashboard
            </h2>

            <p className="text-muted">
              Manage print orders, customers and revenue
            </p>
          </div>

          <div className="d-flex">

            <button
              className="btn btn-success me-2"
              onClick={loadOrders}
            >
              🔄 Refresh
            </button>

            <ExportExcel orders={orders} />

          </div>

        </div>

        <DashboardCards orders={orders} />

        <KPICards orders={orders} />

        <div className="row mt-4">

          <div className="col-lg-8 mb-4">
            <RevenueChart orders={orders} />
          </div>

          <div className="col-lg-4 mb-4">
            <StatusChart orders={orders} />
          </div>

        </div>

        <div className="mb-4">
          <PrintQueue orders={orders} />
        </div>

        <div className="mb-4">
          <RecentOrders orders={orders.slice(0, 5)} />
        </div>
                <div className="card shadow">

          <div className="card-header bg-dark text-white">
            <h5 className="mb-0">
              📋 All Print Orders
            </h5>
          </div>

          <div className="card-body">

            <div className="row mb-4">

              <div className="col-md-6">

                <input
                  type="text"
                  className="form-control"
                  placeholder="🔍 Search customer or file..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

              </div>

              <div className="col-md-3">

                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value)
                  }
                >
                  <option value="All">All Orders</option>
                  <option value="Pending">Pending</option>
                  <option value="Printing">Printing</option>
                  <option value="Ready">Ready</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

              </div>

            </div>

            <table className="table table-hover table-bordered">

              <thead className="table-dark">

                <tr>
                  <th>Customer</th>
                  <th>File</th>
                  <th>Pages</th>
                  <th>Copies</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>

              </thead>

              <tbody>

                {filteredOrders.length === 0 ? (

                  <tr>

                    <td
                      colSpan="7"
                      className="text-center"
                    >
                      No Orders Found
                    </td>

                  </tr>

                ) : (

                  filteredOrders.map((order) => (
                                      <tr key={order._id}>

                    <td>
                      {order.user?.fullName || "N/A"}
                    </td>

                    <td>{order.fileName}</td>

                    <td>{order.pages}</td>

                    <td>{order.copies}</td>

                    <td>₹{order.price}</td>

                    <td>
                      <span
                        className={`badge bg-${badgeColor(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>

                    <td style={{ minWidth: "180px" }}>
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
                        <option value="Pending">
                          Pending
                        </option>

                        <option value="Printing">
                          Printing
                        </option>

                        <option value="Ready">
                          Ready
                        </option>

                        <option value="Completed">
                          Completed
                        </option>

                        <option value="Cancelled">
                          Cancelled
                        </option>
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

    </>
  );
}

export default Admin;