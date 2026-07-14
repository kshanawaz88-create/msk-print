import React from "react";
import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="container mt-5">

      <div className="text-center py-5">
        <h1 className="display-4 fw-bold">
          Welcome to MSK Print Cloud
        </h1>

        <p className="lead mt-3">
          Upload your documents, pay online, and collect your prints without waiting in line.
        </p>

        <div className="mt-4">
          <Link to="/register" className="btn btn-primary btn-lg me-3">
            Get Started
          </Link>

          <Link to="/login" className="btn btn-outline-primary btn-lg">
            Login
          </Link>
        </div>
      </div>

      <hr />

      <div className="row text-center mt-5">

        <div className="col-md-4">
          <h3>📤 Upload</h3>
          <p>Upload PDF and document files securely.</p>
        </div>

        <div className="col-md-4">
          <h3>💳 Pay</h3>
          <p>Choose print options and pay online.</p>
        </div>

        <div className="col-md-4">
          <h3>🖨️ Collect</h3>
          <p>Your print job is ready when you arrive.</p>
        </div>

      </div>

    </div>
  );
}

export default Home;