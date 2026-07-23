import React from "react";
import { Navigate } from "react-router-dom";
import { getStoredToken, getStoredUser } from "../Services/session";

function ProtectedRoute({ children, roles }) {
  const token = getStoredToken();
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
