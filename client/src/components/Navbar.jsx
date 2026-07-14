import React from "react";
import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
      <div className="container">

        <Link className="navbar-brand fw-bold" to="/">
          🖨️ MSK Print Cloud
        </Link>

        {/* Navigation Links */}
        <div className="navbar-nav ms-4">

          <Link className="nav-link text-white" to="/">
            Home
          </Link>

          {user && (
            <>
              <Link className="nav-link text-white" to="/dashboard">
                Dashboard
              </Link>

              <Link className="nav-link text-white" to="/upload">
                Upload
              </Link>
            </>
          )}

        </div>

        {/* Right Side */}
        <div className="ms-auto d-flex align-items-center">

          {user && (
            <span className="text-white me-3">
              Welcome, {user.fullName}
            </span>
          )}

          {user ? (
            <button
              className="btn btn-light btn-sm"
              onClick={logout}
            >
              Logout
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="btn btn-light btn-sm me-2"
              >
                Login
              </Link>

              <Link
                to="/register"
                className="btn btn-warning btn-sm"
              >
                Register
              </Link>
            </>
          )}

        </div>

      </div>
    </nav>
  );
}

export default Navbar;