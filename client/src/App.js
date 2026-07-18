import React from "react";
import { Routes, Route } from "react-router-dom";

import Home from "./Pages/Home";
import Login from "./Pages/Login";
import Register from "./Pages/Register";
import Upload from "./Pages/Upload";
import Payment from "./Pages/Payment";
import Success from "./Pages/Success";
import Admin from "./Pages/Admin";
import MyOrders from "./Pages/MyOrders";
import ShopSettings from "./Pages/ShopSettings";
import Shops from "./Pages/Shops";
import ShopOwner from "./Pages/ShopOwner";
import Staff from "./Pages/Staff";
import StaffManagement from "./Pages/StaffManagement";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>

      {/* Public Routes */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/settings" element={<ShopSettings />} />
      <Route path="/shops" element={<Shops />} />

      {/* Upload */}
      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <Upload />
          </ProtectedRoute>
        }
      />

      {/* Payment */}
      <Route
        path="/payment"
        element={
          <ProtectedRoute>
            <Payment />
          </ProtectedRoute>
        }
      />

      {/* Success */}
      <Route
        path="/success"
        element={
          <ProtectedRoute>
            <Success />
          </ProtectedRoute>
        }
      />

      {/* Orders */}
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <MyOrders />
          </ProtectedRoute>
        }
      />

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* Shop Owner */}
      <Route
        path="/shop-owner"
        element={
          <ProtectedRoute>
            <ShopOwner />
          </ProtectedRoute>
        }
      />

      {/* Staff */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <Staff />
          </ProtectedRoute>
        }
      />

      {/* Staff Management */}
      <Route
        path="/staff-management"
        element={
          <ProtectedRoute>
            <StaffManagement />
          </ProtectedRoute>
        }
      />

    </Routes>
  );
}

export default App;