import React from "react";
import {
  FaCloudUploadAlt,
  FaPrint,
  FaCreditCard,
  FaCheckCircle,
} from "react-icons/fa";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-primary text-white py-5">
        <div className="container">
          <div className="row align-items-center">

            <div className="col-lg-6">
              <h1 className="display-4 fw-bold">
                Print Documents from Anywhere
              </h1>

              <p className="lead mt-4">
                Upload your PDF, pay online and collect your prints without waiting in line.
              </p>

              <div className="mt-4">
                <Link
                  to="/upload"
                  className="btn btn-light btn-lg me-3"
                >
                  Upload Now
                </Link>

                <Link
                  to="/register"
                  className="btn btn-outline-light btn-lg"
                >
                  Get Started
                </Link>
              </div>

              <div className="mt-5">
                <p>✔ Secure Payments</p>
                <p>✔ Fast Printing</p>
                <p>✔ Email Notifications</p>
              </div>
            </div>

            <div className="col-lg-6 text-center">
              <img
                src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800"
                alt="Printing"
                className="img-fluid rounded shadow"
              />
            </div>

          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-5">
        <h2 className="text-center mb-5">
          Why Choose MSK Print Cloud?
        </h2>

        <div className="row text-center">

          <div className="col-md-3 mb-4">
            <FaCloudUploadAlt size={50} className="text-primary mb-3" />
            <h5>Upload</h5>
            <p>Upload files securely from anywhere.</p>
          </div>

          <div className="col-md-3 mb-4">
            <FaCreditCard size={50} className="text-success mb-3" />
            <h5>Pay Online</h5>
            <p>Quick and secure online payments.</p>
          </div>

          <div className="col-md-3 mb-4">
            <FaPrint size={50} className="text-danger mb-3" />
            <h5>We Print</h5>
            <p>High-quality printing.</p>
          </div>

          <div className="col-md-3 mb-4">
            <FaCheckCircle size={50} className="text-warning mb-3" />
            <h5>Collect</h5>
            <p>Pick up your documents when ready.</p>
          </div>

        </div>
      </section>

      {/* Statistics */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="row text-center">

            <div className="col-md-3">
              <h2 className="text-primary">500+</h2>
              <p>Orders</p>
            </div>

            <div className="col-md-3">
              <h2 className="text-success">100+</h2>
              <p>Customers</p>
            </div>

            <div className="col-md-3">
              <h2 className="text-danger">99%</h2>
              <p>Success Rate</p>
            </div>

            <div className="col-md-3">
              <h2 className="text-warning">24/7</h2>
              <p>Availability</p>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}

export default Hero;