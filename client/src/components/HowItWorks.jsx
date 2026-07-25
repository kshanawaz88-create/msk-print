import React from "react";
import {
  FaCloudUploadAlt,
  FaCreditCard,
  FaPrint,
  FaBoxOpen,
} from "react-icons/fa";

function HowItWorks() {
  const steps = [
    {
      icon: <FaCloudUploadAlt size={45} className="text-primary" />,
      title: "1. Upload File",
      text: "Upload a PDF, JPG, or PNG from your device.",
    },
    {
      icon: <FaCreditCard size={45} className="text-success" />,
      title: "2. Pay Online",
      text: "Select print options and choose Razorpay, UPI, or pay at shop when available.",
    },
    {
      icon: <FaPrint size={45} className="text-danger" />,
      title: "3. We Print",
      text: "Our team prints your documents using high-quality printers.",
    },
    {
      icon: <FaBoxOpen size={45} className="text-warning" />,
      title: "4. Collect",
      text: "Track the order and visit the shop when it is ready for collection.",
    },
  ];

  return (
    <section className="py-5 bg-white">
      <div className="container">
        <h2 className="text-center fw-bold mb-3">
          How It Works
        </h2>

        <p className="text-center text-muted mb-5">
          Printing in just four simple steps.
        </p>

        <div className="row">
          {steps.map((step, index) => (
            <div className="col-md-3 mb-4" key={index}>
              <div className="card border-0 shadow h-100 text-center p-4">
                <div className="mb-3">{step.icon}</div>

                <h5>{step.title}</h5>

                <p className="text-muted">
                  {step.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
