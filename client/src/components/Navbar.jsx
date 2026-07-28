import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser } from "../Services/session";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const user = getStoredUser();
  const active = (path) =>
    location.pathname === path ? "btn-light text-dark" : "btn-outline-light";

  useEffect(() => {
    setExpanded(false);
  }, [location.pathname]);

  const logout = () => {
    clearSession();
    setExpanded(false);
    navigate("/login");
  };

  const navLink = (path, label) => (
    <Link
      to={path}
      className={`btn btn-sm ${active(path)}`}
      onClick={() => setExpanded(false)}
    >
      {label}
    </Link>
  );

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/" onClick={() => setExpanded(false)}>
          MSK Print Cloud
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          aria-controls="mainNavigation"
          aria-expanded={expanded}
          aria-label="Toggle navigation"
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div
          id="mainNavigation"
          className={`collapse navbar-collapse ${expanded ? "show" : ""}`}
        >
          <div className="ms-auto d-flex align-items-lg-center align-items-stretch flex-column flex-lg-row flex-wrap gap-2 py-2 py-lg-0">
            {user && (
              <>
                {navLink("/upload", "Upload")}
                {navLink("/orders", "Orders")}
              </>
            )}

            {user?.role === "admin" && (
              <>
                {navLink("/admin", "Dashboard")}
                {navLink("/shops", "Shops")}
                {navLink("/staff-management", "Staff")}
                {navLink("/settings", "Settings")}
                {navLink("/qr-code", "QR Code")}
              </>
            )}

            {user?.role === "shopOwner" && (
              <>
                {navLink("/shop-owner", "Dashboard")}
                {navLink("/settings", "Settings")}
                {navLink("/qr-code", "QR Code")}
              </>
            )}

            {user?.role === "staff" && navLink("/staff", "Assigned Orders")}

            {user ? (
              <>
                <span className="text-white ms-lg-2 px-1">
                  Welcome, {user.fullName || "User"}
                </span>
                <button className="btn btn-danger btn-sm" type="button" onClick={logout}>
                  Logout
                </button>
              </>
            ) : (
              <>
                {navLink("/login", "Login")}
                <Link
                  to="/register"
                  className="btn btn-success btn-sm"
                  onClick={() => setExpanded(false)}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
