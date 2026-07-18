import React, { useEffect, useState } from "react";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import { jsPDF } from "jspdf";

function MyOrders() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const response = await API.get("/api/print");
      setOrders(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const downloadInvoice = (order) => {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text("MSK Print Cloud", 20, 20);

    doc.setFontSize(12);

    doc.text(`File Name: ${order.fileName}`, 20, 40);
    doc.text(`Pages: ${order.pages}`, 20, 50);
    doc.text(`Copies: ${order.copies}`, 20, 60);
    doc.text(`Print Type: ${order.printType}`, 20, 70);
    doc.text(`Printing Side: ${order.side}`, 20, 80);
    doc.text(`Price: ₹${order.price}`, 20, 90);
    doc.text(`Status: ${order.status}`, 20, 100);

    doc.text(
      `Date: ${new Date(order.createdAt).toLocaleString()}`,
      20,
      110
    );

    doc.text("Thank you for choosing MSK Print Cloud!", 20, 130);

    doc.save(`Invoice-${order.fileName}.pdf`);
  };

  return (
    <>
      <Navbar />

      <div className="container mt-5">

        <h2 className="mb-4">📄 My Print Orders</h2>

        <table className="table table-bordered table-striped table-hover">

          <thead className="table-dark">
            <tr>
              <th>File Name</th>
              <th>Pages</th>
              <th>Copies</th>
              <th>Price</th>
              <th>Status</th>
              <th>Invoice</th>
            </tr>
          </thead>

          <tbody>

            {orders.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center">
                  No Orders Found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order._id}>

                  <td>{order.fileName}</td>

                  <td>{order.pages}</td>

                  <td>{order.copies}</td>

                  <td>₹{order.price}</td>

                  <td>
                    <span className="badge bg-primary">
                      {order.status}
                    </span>
                  </td>

                  <td>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => downloadInvoice(order)}
                    >
                      📄 Download
                    </button>
                  </td>

                </tr>
              ))
            )}

          </tbody>

        </table>

      </div>
    </>
  );
}

export default MyOrders;