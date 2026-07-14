import React from "react";

function Payment() {
  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>💳 Payment</h1>

      <h2>Total: ₹2</h2>

      <button
        style={{
          padding: "15px 40px",
          fontSize: "20px",
          cursor: "pointer"
        }}
      >
        Pay with UPI
      </button>
    </div>
  );
}

export default Payment;