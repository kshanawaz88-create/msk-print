import React from "react";

function Success() {
  return (
    <div>
      <h1>Payment Successful 🎉</h1>

      <p>Your print order has been received.</p>

      <p>Status: Pending</p>

      <button onClick={() => (window.location.href = "/upload")}>
        Create New Print Job
      </button>
    </div>
  );
}

export default Success;