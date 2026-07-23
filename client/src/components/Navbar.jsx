import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser } from "../Services/session";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const active = (path) =>
    location.pathname === path ? "btn-light text-dark" : "btn-outline-light";

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/">MSK Print Cloud</Link>
        <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
          {user && (
            <>
              <Link to="/upload" className={`btn btn-sm ${active("/upload")}`}>Upload</Link>
              <Link to="/orders" className={`btn btn-sm ${active("/orders")}`}>Orders</Link>
            </>
          )}
          {user?.role === "admin" && (
            <>
              <Link to="/admin" className={`btn btn-sm ${active("/admin")}`}>Dashboard</Link>
              <Link to="/shops" className={`btn btn-sm ${active("/shops")}`}>Shops</Link>
              <Link to="/staff-management" className={`btn btn-sm ${active("/staff-management")}`}>Staff</Link>
              <Link to="/settings" className={`btn btn-sm ${active("/settings")}`}>Settings</Link>
              <Link
  to="/qr-code"
  className={`btn btn-sm ${active("/qr-code")}`}
>
  QR Code
</Link>
            </>
          )}
          {user?.role === "shopOwner" && (
            <>
              <Link to="/shop-owner" className={`btn btn-sm ${active("/shop-owner")}`}>Dashboard</Link>
              <Link to="/settings" className={`btn btn-sm ${active("/settings")}`}>Settings</Link>
              <>
  <Link
    to="/shop-owner"
    className={`btn btn-sm ${active("/shop-owner")}`}
  >
    Dashboard
  </Link>

  <Link
    to="/qr-code"
    className={`btn btn-sm ${active("/qr-code")}`}
  >
    QR Code
  </Link>
</>
            </>
          )}
          {user?.role === "staff" && (
            <Link to="/staff" className={`btn btn-sm ${active("/staff")}`}>Assigned Orders</Link>
          )}
          {user ? (
            <>
              <span className="text-white ms-2">Welcome, {user.fullName}</span>
              <button className="btn btn-danger btn-sm" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline-light btn-sm">Login</Link>
              <Link to="/register" className="btn btn-success btn-sm">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
