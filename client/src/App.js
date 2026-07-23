import React from "react";

import {
  Navigate,
  Routes,
  Route,
} from "react-router-dom";

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
import Invoice from "./Pages/Invoice";
import PublicShop from "./Pages/PublicShop";
import QRCodePage from "./Pages/QRCode";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>

      {/* ================= PUBLIC ROUTES ================= */}

      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      <Route
        path="/shop/:shopCode"
        element={<PublicShop />}
      />

      <Route
        path="/shop/:shopCode/payment/:orderToken"
        element={<Payment />}
      />

      <Route
        path="/shop/:shopCode/success/:orderToken"
        element={<Success />}
      />

      {/* ================= SHOP SETTINGS ================= */}

      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={["admin", "shopOwner"]}>
            <ShopSettings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/shops/:id/payment-settings"
        element={
          <ProtectedRoute roles={["admin", "shopOwner"]}>
            <ShopSettings />
          </ProtectedRoute>
        }
      />

      {/* ================= SHOPS ================= */}

      <Route
        path="/shops"
        element={
          <ProtectedRoute roles={["admin"]}>
            <Shops />
          </ProtectedRoute>
        }
      />

      {/* ================= UPLOAD ================= */}

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <Upload />
          </ProtectedRoute>
        }
      />

      {/* ================= PAYMENT ================= */}

      <Route
        path="/payment"
        element={
          <ProtectedRoute>
            <Payment />
          </ProtectedRoute>
        }
      />

      {/* ================= SUCCESS ================= */}

      <Route
        path="/success"
        element={
          <ProtectedRoute>
            <Success />
          </ProtectedRoute>
        }
      />

      {/* ================= ORDERS ================= */}

      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <MyOrders />
          </ProtectedRoute>
        }
      />

      <Route
        path="/invoice/:id"
        element={
          <ProtectedRoute>
            <Invoice />
          </ProtectedRoute>
        }
      />

      {/* ================= ADMIN ================= */}

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* ================= SHOP OWNER ================= */}

      <Route
        path="/shop-owner"
        element={
          <ProtectedRoute roles={["shopOwner"]}>
            <ShopOwner />
          </ProtectedRoute>
        }
      />

      {/* ================= STAFF ================= */}

      <Route
        path="/staff"
        element={
          <ProtectedRoute roles={["staff"]}>
            <Staff />
          </ProtectedRoute>
        }
      />

      {/* ================= STAFF MANAGEMENT ================= */}

      <Route
        path="/staff-management"
        element={
          <ProtectedRoute roles={["admin"]}>
            <StaffManagement />
          </ProtectedRoute>
        }
      />

      {/* ================= QR CODE ================= */}

      <Route
        path="/qr-code"
        element={
          <ProtectedRoute roles={["admin", "shopOwner"]}>
            <QRCodePage />
          </ProtectedRoute>
        }
      />

      {/* ================= 404 ================= */}

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />

    </Routes>
  );
}

export default App;
