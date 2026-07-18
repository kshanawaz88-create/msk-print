import React from "react";
import Sidebar from "./Sidebar";

function AdminLayout({ children }) {
  return (
    <div className="d-flex">

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div
        className="flex-grow-1"
        style={{
          minHeight: "100vh",
          background: "#f5f7fb",
        }}
      >
        {/* Top Bar */}
        <div
          className="bg-white shadow-sm d-flex justify-content-between align-items-center px-4"
          style={{ height: "70px" }}
        >
          <h4 className="mb-0">MSK Print Cloud</h4>

          <div className="d-flex align-items-center">
            <span className="me-3">🔔</span>
            <span className="me-3">👤 Admin</span>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-4">
          {children}
        </div>
      </div>

    </div>
  );
}

export default AdminLayout;