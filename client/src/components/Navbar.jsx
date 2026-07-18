import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = JSON.parse(localStorage.getItem("user"));

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) =>
    location.pathname === path ? "btn-light text-dark" : "btn-outline-light";

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow">
      <div className="container">

        <Link className="navbar-brand fw-bold" to="/">
          🖨️ MSK Print Cloud
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">

          <div className="ms-auto d-flex align-items-center flex-wrap">

            {user ? (
              <>
                <Link
                  to="/upload"
                  className={`btn btn-sm me-2 ${isActive("/upload")}`}
                >
                  📤 Upload
                </Link>

                <Link
                  to="/shops"
                  className={`btn btn-sm me-2 ${isActive("/shops")}`}
                >
                  🏪 Shops
                </Link>

    <Link to="/staff" className="btn btn-warning me-2">
  👨‍💼 Staff
</Link>

<Link to="/staff-management" className="btn btn-warning me-2">
  ➕ Add Staff
</Link>
                <Link
                  to="/orders"
                  className={`btn btn-sm me-2 ${isActive("/orders")}`}
                >
                  📦 Orders
                </Link>

                {user.role === "admin" && (
                  <>
                    <Link
                      to="/admin"
                      className={`btn btn-sm me-2 ${isActive("/admin")}`}
                    >
                      📊 Dashboard
                    </Link>

                    <Link
                      to="/settings"
                      className={`btn btn-sm me-2 ${isActive("/settings")}`}
                    >
                      ⚙️ Settings
                    </Link>
                  </>
                )}

                <span className="text-white me-3">
                  👋 Welcome, {user.name}
                </span>

                <button
                  className="btn btn-danger btn-sm"
                  onClick={logout}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn btn-outline-light btn-sm me-2"
                >
                  Login
                </Link>

                <Link
                  to="/register"
                  className="btn btn-success btn-sm"
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