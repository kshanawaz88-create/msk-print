import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FaTachometerAlt,
  FaPrint,
  FaUsers,
  FaStore,
  FaCog,
  FaChartBar,
  FaMoneyBillWave,
  FaSignOutAlt,
} from "react-icons/fa";

function Sidebar() {
  const location = useLocation();

  const menu = [
    {
      name: "Dashboard",
      icon: <FaTachometerAlt />,
      path: "/admin",
    },
    {
      name: "Orders",
      icon: <FaPrint />,
      path: "/orders",
    },
    {
      name: "Customers",
      icon: <FaUsers />,
      path: "/customers",
    },
    {
      name: "Shops",
      icon: <FaStore />,
      path: "/shops",
    },
    {
      name: "Settings",
      icon: <FaCog />,
      path: "/settings",
    },
    {
      name: "Reports",
      icon: <FaChartBar />,
      path: "/reports",
    },
    {
      name: "Revenue",
      icon: <FaMoneyBillWave />,
      path: "/revenue",
    },
  ];

  return (
    <div
      className="bg-dark text-white p-3"
      style={{
        width: "260px",
        minHeight: "100vh",
      }}
    >
      <h3 className="text-center mb-4">
        🖨️ MSK Print
      </h3>

      {menu.map((item) => (
        <Link
          key={item.name}
          to={item.path}
          className={`d-flex align-items-center text-decoration-none p-3 rounded mb-2 ${
            location.pathname === item.path
              ? "bg-primary text-white"
              : "text-light"
          }`}
        >
          <span style={{ fontSize: "20px" }}>
            {item.icon}
          </span>

          <span className="ms-3">
            {item.name}
          </span>
        </Link>
      ))}

      <hr />

      <button className="btn btn-danger w-100">
        <FaSignOutAlt /> Logout
      </button>
    </div>
  );
}

export default Sidebar;