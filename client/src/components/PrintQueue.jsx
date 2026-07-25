import React from "react";

function PrintQueue({ orders = [], updateStatus }) {
  const pending = orders.filter((order) => order.status === "Pending");
  const printing = orders.filter((order) => order.status === "Printing");
  const ready = orders.filter((order) => order.status === "Ready");

  const renderCard = (order, buttonText, nextStatus, color) => {
    const paymentRequired =
      ["Printing", "Ready", "Completed"].includes(nextStatus) &&
      order.paymentStatus !== "Paid";

    return (
      <div
        key={order._id}
        className="card shadow mb-3 border-0"
        style={{ borderLeft: `6px solid ${color}` }}
      >
        <div className="card-body">
          <h5>📄 {order.fileName || "Unnamed file"}</h5>
          <p className="mb-1">
            👤 <strong>{order.user?.fullName || order.customerName || "Guest"}</strong>
          </p>
          <p className="mb-1">
            📑 {order.pages || 1} Pages × {order.copies || 1} Copies
          </p>
          <p className="mb-1">🎨 {order.printType || "Black & White"}</p>
          <p className="mb-1">💰 ₹{Number(order.price || 0).toFixed(2)}</p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={paymentRequired}
            onClick={() => updateStatus(order._id, nextStatus)}
          >
            {buttonText}
          </button>
          {paymentRequired && (
            <div className="small text-danger mt-2">
              Payment must be Paid before this order can enter or advance in the print queue.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="row">
      <div className="col-lg-4">
        <h4 className="text-warning mb-3">🟡 Pending</h4>
        {pending.length === 0 ? (
          <p>No pending orders</p>
        ) : (
          pending.map((order) => renderCard(order, "▶ Start Printing", "Printing", "#ffc107"))
        )}
      </div>

      <div className="col-lg-4">
        <h4 className="text-primary mb-3">🔵 Printing</h4>
        {printing.length === 0 ? (
          <p>No printing jobs</p>
        ) : (
          printing.map((order) => renderCard(order, "✔ Mark Ready", "Ready", "#0d6efd"))
        )}
      </div>

      <div className="col-lg-4">
        <h4 className="text-success mb-3">🟢 Ready</h4>
        {ready.length === 0 ? (
          <p>No ready orders</p>
        ) : (
          ready.map((order) => renderCard(order, "✅ Complete", "Completed", "#198754"))
        )}
      </div>
    </div>
  );
}

export default PrintQueue;
