import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../Services/Api";

import Navbar from "../components/Navbar";
import DashboardCards from "../components/DashboardCards";
import RevenueChart from "../components/RevenueChart";
import StatusChart from "../components/StatusChart";
import RecentOrders from "../components/RecentOrders";
import ExportExcel from "../components/ExportExcel";
import KPICards from "../components/KPICards";
import PrintQueue from "../components/PrintQueue";

const allowedTransitions = {
  Pending: ["Printing", "Cancelled"],
  Printing: ["Ready", "Cancelled"],
  Ready: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

function Admin() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadOrders();

    API.get("/api/users/staff")
      .then((response) => {
        setStaff(response.data.staff || []);
      })
      .catch(() => {
        setStaff([]);
      });

    const interval = setInterval(() => {
      loadOrders();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadOrders = async () => {
    try {
      setError("");

      const response = await API.get("/api/print");

      setOrders(response.data.orders || []);
    } catch (loadError) {
      setError(
        loadError.response?.data?.message ||
          "Unable to load print queue"
      );
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await API.put(`/api/print/${id}`, {
        status,
      });

      loadOrders();
    } catch (updateError) {
      alert(
        updateError.response?.data?.message ||
          "Unable to update print status"
      );
    }
  };

  const updateOrder = async (id, data) => {
    try {
      await API.put(`/api/print/${id}`, data);

      loadOrders();
    } catch (updateError) {
      alert(
        updateError.response?.data?.message ||
          "Unable to update order"
      );
    }
  };

  const reviewUpiPayment = async (id, decision) => {
    try {
      await API.patch(
        `/api/payment/upi/${id}/verify`,
        {
          decision,
        }
      );

      loadOrders();
    } catch (reviewError) {
      alert(
        reviewError.response?.data?.message ||
          "Unable to review UPI payment"
      );
    }
  };

  const approveCashPayment = async (id) => {
    const confirmed = window.confirm(
      "Confirm that cash has been received for this order?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await API.patch(
        `/api/payment/cash/${id}/verify`
      );

      loadOrders();
    } catch (cashError) {
      alert(
        cashError.response?.data?.message ||
          "Unable to approve cash payment"
      );
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
      case "Error":
        return "danger";

      default:
        return "secondary";
    }
  };

  const paymentBadgeColor = (status) => {
    switch (status) {
      case "Paid":
        return "success";

      case "Rejected":
      case "Failed":
        return "danger";

      case "Refunded":
        return "info";

      default:
        return "warning";
    }
  };

  const filteredOrders = orders.filter((order) => {
    const fileName =
      order.fileName?.toLowerCase() || "";

    const customerName =
      order.user?.fullName?.toLowerCase() || "";

    const invoice =
      order.invoiceNumber?.toLowerCase() || "";

    const upiReference =
      order.upiReference?.toLowerCase() || "";

    const query =
      search.trim().toLowerCase();

    const matchesSearch =
      fileName.includes(query) ||
      customerName.includes(query) ||
      invoice.includes(query) ||
      upiReference.includes(query);

    const matchesStatus =
      statusFilter === "All" ||
      order.status === statusFilter;

    const matchesPayment =
      paymentFilter === "All" ||
      order.paymentStatus === paymentFilter;

    return matchesSearch &&
      matchesStatus &&
      matchesPayment;
  });

  return (
    <>
      <Navbar />

      <div className="container-fluid mt-4">
        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

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
              type="button"
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
          <PrintQueue
            orders={orders}
            updateStatus={updateStatus}
          />
        </div>

        <div className="mb-4">
          <RecentOrders
            orders={orders.slice(0, 5)}
          />
        </div>

        <div className="card shadow">
          <div className="card-header bg-dark text-white">
            <h5 className="mb-0">
              📋 All Print Orders
            </h5>
          </div>

          <div className="card-body">
            <div className="row mb-4">
              <div className="col-md-6 mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search customer, file, invoice or UPI reference..."
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="col-md-3 mb-2">
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Orders
                  </option>

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
              </div>

              <div className="col-md-3 mb-2">
                <select
                  className="form-select"
                  value={paymentFilter}
                  onChange={(event) =>
                    setPaymentFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Payments
                  </option>

                  <option value="Pending">
                    Pending
                  </option>

                  <option value="Paid">
                    Paid
                  </option>

                  <option value="Rejected">
                    Rejected
                  </option>

                  <option value="Refunded">
                    Refunded
                  </option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover table-bordered align-middle">
                <thead className="table-dark">
                  <tr>
                    <th>Customer</th>
                    <th>File</th>
                    <th>Pages</th>
                    <th>Copies</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Assigned Staff</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="text-center"
                      >
                        Loading print queue...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="text-center"
                      >
                        No Orders Found
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order._id}>
                        <td>
                          {order.user?.fullName ||
                            "N/A"}
                        </td>

                        <td>
                          {order.fileName}
                        </td>

                        <td>
                          {order.pages}
                        </td>

                        <td>
                          {order.copies}
                        </td>

                        <td>
                          ₹{order.price}
                        </td>

                        <td>
                          <span
                            className={`badge bg-${badgeColor(
                              order.status
                            )}`}
                          >
                            {order.status}
                          </span>
                        </td>

                        <td style={{ minWidth: "190px" }}>
                          <div>
                            {order.paymentMethod ||
                              "-"}
                          </div>

                          <span
                            className={`badge bg-${paymentBadgeColor(
                              order.paymentStatus
                            )}`}
                          >
                            {order.paymentStatus}
                          </span>

                          {order.invoiceNumber && (
                            <div className="small mt-1">
                              {order.invoiceNumber}
                            </div>
                          )}

                          {order.paymentStatus ===
                            "Paid" &&
                            order.invoiceNumber && (
                              <Link
                                className="btn btn-sm btn-outline-primary mt-1"
                                to={`/invoice/${order._id}`}
                              >
                                View Invoice
                              </Link>
                            )}

                          {order.paymentMethod ===
                            "UPI" &&
                            order.paymentStatus ===
                              "Pending" && (
                              <div className="d-flex gap-1 mt-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  onClick={() =>
                                    reviewUpiPayment(
                                      order._id,
                                      "approve"
                                    )
                                  }
                                >
                                  Approve UPI
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() =>
                                    reviewUpiPayment(
                                      order._id,
                                      "reject"
                                    )
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            )}

                          {order.paymentMethod ===
                            "Cash" &&
                            order.paymentStatus ===
                              "Pending" && (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success w-100"
                                  onClick={() =>
                                    approveCashPayment(
                                      order._id
                                    )
                                  }
                                >
                                  Approve Cash
                                </button>
                              </div>
                            )}
                        </td>

                        <td style={{ minWidth: "180px" }}>
                          <select
                            className="form-select"
                            value={
                              order.assignedStaff
                                ?._id || ""
                            }
                            onChange={(event) =>
                              updateOrder(
                                order._id,
                                {
                                  assignedStaff:
                                    event.target
                                      .value,
                                }
                              )
                            }
                          >
                            <option value="">
                              Unassigned
                            </option>

                            {staff
                              .filter(
                                (member) =>
                                  (member.shopId
                                    ?._id ||
                                    member.shopId) ===
                                  (order.shopId
                                    ?._id ||
                                    order.shopId)
                              )
                              .map((member) => (
                                <option
                                  key={member._id}
                                  value={member._id}
                                >
                                  {member.fullName}
                                </option>
                              ))}
                          </select>
                        </td>

                        <td style={{ minWidth: "180px" }}>
                          <select
                            className="form-select"
                            value={order.status}
                            onChange={(event) =>
                              updateStatus(
                                order._id,
                                event.target.value
                              )
                            }
                          >
                            <option
                              value={order.status}
                            >
                              {order.status}
                            </option>

                            {(
                              allowedTransitions[
                                order.status
                              ] || []
                            ).map((status) => (
                              <option
                                key={status}
                                value={status}
                                disabled={
                                  status ===
                                    "Completed" &&
                                  order.paymentStatus !==
                                    "Paid"
                                }
                              >
                                {status}
                              </option>
                            ))}
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
      </div>
    </>
  );
}

export default Admin;