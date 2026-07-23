import React from "react";

function KPICards({ orders }) {
  const today = new Date().toDateString();

  const todaysOrders = orders.filter(
    (order) =>
      new Date(order.createdAt).toDateString() === today
  );

  const todaysRevenue = todaysOrders.reduce(
    (total, order) => total + (order.paymentStatus === "Paid" ? Number(order.price || 0) : 0),
    0
  );

  const customers = new Set(
    orders.map((order) => order.user?._id)
  ).size;

  const averageOrder =
    orders.filter((order) => order.paymentStatus === "Paid").length > 0
      ? (
          orders.reduce(
            (total, order) => total + (order.paymentStatus === "Paid" ? Number(order.price || 0) : 0),
            0
          ) / orders.filter((order) => order.paymentStatus === "Paid").length
        ).toFixed(2)
      : 0;

  return (
    <div className="row mt-4">

      <div className="col-md-3 mb-3">
        <div className="card bg-success text-white shadow">
          <div className="card-body text-center">
            <h6>Today's Revenue</h6>
            <h3>₹{todaysRevenue}</h3>
          </div>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="card bg-primary text-white shadow">
          <div className="card-body text-center">
            <h6>Today's Orders</h6>
            <h3>{todaysOrders.length}</h3>
          </div>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="card bg-warning shadow">
          <div className="card-body text-center">
            <h6>Total Customers</h6>
            <h3>{customers}</h3>
          </div>
        </div>
      </div>

      <div className="col-md-3 mb-3">
        <div className="card bg-dark text-white shadow">
          <div className="card-body text-center">
            <h6>Average Order</h6>
            <h3>₹{averageOrder}</h3>
          </div>
        </div>
      </div>

    </div>
  );
}

export default KPICards;
