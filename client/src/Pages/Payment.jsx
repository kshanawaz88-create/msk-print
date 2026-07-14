import React, { useEffect, useState } from "react";
import API from "../Services/Api";

function Payment() {
  const [order, setOrder] = useState(null);

  const [copies, setCopies] = useState(1);
  const [printType, setPrintType] = useState("Black & White");
  const [side, setSide] = useState("Single Side");
  const [price, setPrice] = useState(0);

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

  useEffect(() => {
    if (!order) return;

    const pages = order.pages || 1;

    let rate = 2;

    if (printType === "Color") {
      rate = 10;
    }

    let total = pages * copies * rate;

    if (side === "Double Side") {
      total = Math.round(total * 0.9);
    }

    setPrice(total);
  }, [order, copies, printType, side]);

  const proceedPayment = async () => {
    const jobId = localStorage.getItem("printJobId");

    try {
      await API.put(`/api/print/${jobId}`, {
        copies,
        printType,
        side,
        price,
      });

      window.location.href = "/success";
    } catch (error) {
      console.log(error);
    }
  };

  if (!order) {
    return <h2>Loading...</h2>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Payment</h2>

      <hr />

      <p>
        <strong>File:</strong> {order.fileName}
      </p>

      <p>
        <strong>Pages:</strong> {order.pages}
      </p>

      <p>
        <strong>Status:</strong> {order.status}
      </p>

      <hr />

      <label>Copies</label>

      <br />

      <input
        type="number"
        min="1"
        value={copies}
        onChange={(e) => setCopies(Number(e.target.value))}
      />

      <br />
      <br />

      <label>Print Type</label>

      <br />

      <select
        value={printType}
        onChange={(e) => setPrintType(e.target.value)}
      >
        <option>Black & White</option>
        <option>Color</option>
      </select>

      <br />
      <br />

      <label>Printing Side</label>

      <br />

      <select value={side} onChange={(e) => setSide(e.target.value)}>
        <option>Single Side</option>
        <option>Double Side</option>
      </select>

      <hr />

      <h2>Total Price : ₹{price}</h2>

      <button onClick={proceedPayment}>
        Proceed to Pay
      </button>
    </div>
  );
}

export default Payment;