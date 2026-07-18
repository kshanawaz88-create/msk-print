import React from "react";

function PrintQueue({ orders, updateStatus }) {
  const pending = orders.filter(
    (o) => o.status === "Pending"
  );

  const printing = orders.filter(
    (o) => o.status === "Printing"
  );

  const ready = orders.filter(
    (o) => o.status === "Ready"
  );

  const renderCard = (order, buttonText, nextStatus, color) => (
    <div
      key={order._id}
      className="card shadow mb-3 border-0"
      style={{ borderLeft: `6px solid ${color}` }}
    >
      <div className="card-body">

        <h5>📄 {order.fileName}</h5>

        <p className="mb-1">
          👤 <strong>{order.user?.fullName || "Guest"}</strong>
        </p>

        <p className="mb-1">
          📑 {order.pages} Pages × {order.copies || 1} Copies
        </p>

        <p className="mb-1">
          🎨 {order.printType || "Black & White"}
        </p>

        <p className="mb-1">
          💰 ₹{order.price || 0}
        </p>

        <button
          className="btn btn-primary mt-3"
          onClick={() =>
            updateStatus(order._id, nextStatus)
          }
        >
          {buttonText}
        </button>

      </div>
    </div>
  );

  return (
    <div className="row">

      <div className="col-lg-4">
        <h4 className="text-warning mb-3">
          🟡 Pending
        </h4>

        {pending.length === 0 ? (
          <p>No pending orders</p>
        ) : (
          pending.map((order) =>
            renderCard(
              order,
              "▶ Start Printing",
              "Printing",
              "#ffc107"
            )
          )
        )}
      </div>

      <div className="col-lg-4">
        <h4 className="text-primary mb-3">
          🔵 Printing
        </h4>

        {printing.length === 0 ? (
          <p>No printing jobs</p>
        ) : (
          printing.map((order) =>
            renderCard(
              order,
              "✔ Mark Ready",
              "Ready",
              "#0d6efd"
            )
          )
        )}
      </div>

      <div className="col-lg-4">
        <h4 className="text-success mb-3">
          🟢 Ready
        </h4>

        {ready.length === 0 ? (
          <p>No ready orders</p>
        ) : (
          ready.map((order) =>
            renderCard(
              order,
              "✅ Complete",
              "Completed",
              "#198754"
            )
          )
        )}
      </div>

    </div>
  );
}

export default PrintQueue;