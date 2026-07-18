import React, { useEffect, useState } from "react";
import API from "../Services/Api";

function Success() {
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const jobId = localStorage.getItem("printJobId");

    API.get(`/api/print/${jobId}`)
      .then((res) => {
        setOrder(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  if (!order) {
    return <h3 className="text-center mt-5">Loading...</h3>;
  }

  return (
    <div className="container mt-5">

      <div className="card shadow-lg">

        <div className="card-header bg-success text-white">
          <h2>✅ Payment Successful</h2>
        </div>

        <div className="card-body">

          <h4 className="mb-4">
            🎉 Thank you for your order!
          </h4>

          <table className="table table-bordered">

            <tbody>

              <tr>
                <th>Order ID</th>
                <td>{order._id}</td>
              </tr>

              <tr>
                <th>File Name</th>
                <td>{order.fileName}</td>
              </tr>

              <tr>
                <th>Status</th>
                <td>
                  <span className="badge bg-warning">
                    {order.status}
                  </span>
                </td>
              </tr>

              <tr>
                <th>Amount</th>
                <td>₹{order.price}</td>
              </tr>

            </tbody>

          </table>

          <button
            className="btn btn-primary me-3"
            onClick={() => window.location.href="/orders"}
          >
            📄 View My Orders
          </button>

          <button
            className="btn btn-success"
            onClick={() => window.location.href="/upload"}
          >
            📤 Upload Another File
          </button>

        </div>

      </div>

    </div>
  );
}

export default Success;