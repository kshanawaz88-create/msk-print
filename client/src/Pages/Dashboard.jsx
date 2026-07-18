import React, { useEffect, useState } from "react";
import API from "../Services/Api";
import AdminLayout from "../components/AdminLayout";
import DashboardCards from "../components/DashboardCards";
import RevenueChart from "../components/RevenueChart";
import InvoiceButton from "../components/InvoiceButton";

function Admin() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await API.get("/api/print");
      setOrders(res.data);
    } catch (error) {
      console.log(error);
    }
  };

 return (
  <AdminLayout>

    <h2 className="mb-4">📊 Admin Dashboard</h2>

    <div className="row g-3 mb-4">
      <DashboardCards orders={orders} />
    </div>

    <div className="card shadow mb-4">
      <div className="card-header">
        <h5 className="mb-0">Monthly Revenue</h5>
      </div>

      <div className="card-body">
        <RevenueChart orders={orders} />
      </div>
    </div>

    <div className="card shadow">
      <div className="card-header">
        <h5 className="mb-0">Recent Orders</h5>
      </div>

      <div className="card-body table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>File</th>
              <th>Pages</th>
              <th>Status</th>
              <th>Price</th>
              <th>Invoice</th>
            </tr>
          </thead>

          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center">
                  No Orders Found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order._id}>
                  <td>{order.fileName}</td>
                  <td>{order.pages}</td>
                  <td>{order.status}</td>
                  <td>₹{order.price}</td>
                  <td>
                    <InvoiceButton order={order} />
                  </td>
                </tr>
              ))
            )}
          </tbody>

        </table>
      </div>
    </div>

  </AdminLayout>
);

export default Admin;