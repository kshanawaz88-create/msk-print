import React from "react";

const steps = ["Pending", "Printing", "Ready", "Completed"];

function OrderProgress({ status = "Pending" }) {
  if (status === "Cancelled") {
    return <span className="badge bg-danger">Cancelled</span>;
  }

  if (status === "Error") {
    return <span className="badge bg-danger">Print Error</span>;
  }

  const current = Math.max(steps.indexOf(status), 0);

  return (
    <div className="d-flex align-items-center flex-wrap gap-1" aria-label={`Order status: ${status}`}>
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <span className={`badge ${index <= current ? "bg-primary" : "bg-secondary"}`}>
            {step}
          </span>
          {index < steps.length - 1 && <span className="text-muted">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export default OrderProgress;
