import React from "react";
import {
  FaPrint,
  FaClock,
  FaCheckCircle,
  FaMoneyBillWave,
} from "react-icons/fa";

function DashboardCards({ orders }) {
  const totalOrders = orders.length;

  const pending = orders.filter(
    (order) => order.status === "Pending"
  ).length;

  const completed = orders.filter(
    (order) => order.status === "Completed"
  ).length;

  const revenue = orders.reduce(
    (sum, order) => sum + (order.price || 0),
    0
  );

  const cardStyle = {
    borderRadius: "15px",
    padding: "25px",
    color: "white",
    minHeight: "150px",
  };

  return (
    <>
      <div className="col-md-3 mb-3">
        <div className="bg-primary shadow" style={cardStyle}>
          <FaPrint size={40} />
          <h2 className="mt-3">{totalOrders}</h2>
          <p className="mb-0">Total Orders</p>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="bg-warning shadow" style={cardStyle}>
          <FaClock size={40} />
          <h2 className="mt-3">{pending}</h2>
          <p className="mb-0">Pending Orders</p>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="bg-success shadow" style={cardStyle}>
          <FaCheckCircle size={40} />
          <h2 className="mt-3">{completed}</h2>
          <p className="mb-0">Completed Orders</p>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="bg-dark shadow" style={cardStyle}>
          <FaMoneyBillWave size={40} />
          <h2 className="mt-3">₹{revenue}</h2>
          <p className="mb-0">Total Revenue</p>
        </div>
      </div>
    </>
  );
}

export default DashboardCards;