import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import API from "../Services/Api";
import { getStoredUser } from "../Services/session";
import Navbar from "../components/Navbar";

const generalDefaults = {
  shopName: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  blackWhitePrice: 2,
  colorPrice: 10,
  a3Price: 15,
  gst: 18,
  currency: "INR",
  openingTime: "",
  closingTime: "",
};

const paymentDefaults = {
  paymentEnabled: true,
  paymentMode: "both",
  upiId: "",
  razorpayKeyId: "",
  paymentInstructions: "",
  hasRazorpaySecret: false,
  hasWebhookSecret: false,
  hasLegacyPlaintextSecret: false,
  webhookUrl: "",
};

const normalizedId = (value) =>
  typeof value === "object" && value ? value._id : value || "";

function ShopSettings() {
  const { id: routeShopId } = useParams();
  const user = useMemo(() => getStoredUser(), []);
  const ownerShopId = normalizedId(user?.shopId);
  const isAdmin = user?.role === "admin";

  const [general, setGeneral] = useState(generalDefaults);
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(
    routeShopId || ownerShopId
  );
  const [payment, setPayment] = useState(paymentDefaults);
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState("");
  const [clearKeySecret, setClearKeySecret] = useState(false);
  const [clearWebhookSecret, setClearWebhookSecret] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const loadAdminData = async () => {
      try {
        const [settingsResponse, shopsResponse] = await Promise.all([
          API.get("/api/settings"),
          API.get("/api/shops"),
        ]);
        if (!active) return;
        setGeneral({
          ...generalDefaults,
          ...(settingsResponse.data?.settings || {}),
        });
        const loadedShops = Array.isArray(shopsResponse.data?.shops)
          ? shopsResponse.data.shops
          : Array.isArray(shopsResponse.data)
          ? shopsResponse.data
          : [];
        setShops(loadedShops);
        setSelectedShopId((current) =>
          current || normalizedId(loadedShops[0]?._id)
        );
      } catch (error) {
        if (active) {
          setMessage(
            error.response?.data?.message || "Unable to load shop settings"
          );
        }
      }
    };
    loadAdminData();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedShopId) return;
    let active = true;
    const loadPaymentSettings = async () => {
      try {
        setLoadingPayment(true);
        setMessage("");
        const response = await API.get(
          `/api/shops/${selectedShopId}/payment-settings`
        );
        if (!active) return;
        const safe = response.data?.paymentSettings || {};
        setPayment({
          paymentEnabled: safe.paymentEnabled !== false,
          paymentMode: safe.paymentMode || "both",
          upiId: safe.upiId || "",
          razorpayKeyId: safe.razorpayKeyId || "",
          paymentInstructions: safe.paymentInstructions || "",
          hasRazorpaySecret: safe.hasRazorpaySecret === true,
          hasWebhookSecret: safe.hasWebhookSecret === true,
          hasLegacyPlaintextSecret: safe.hasLegacyPlaintextSecret === true,
          webhookUrl: safe.webhookUrl || "",
        });
        setRazorpayKeySecret("");
        setRazorpayWebhookSecret("");
        setClearKeySecret(false);
        setClearWebhookSecret(false);
      } catch (error) {
        if (active) {
          setMessage(
            error.response?.data?.message ||
            "Unable to load payment settings"
          );
        }
      } finally {
        if (active) setLoadingPayment(false);
      }
    };
    loadPaymentSettings();
    return () => {
      active = false;
    };
  }, [selectedShopId]);

  const updateGeneral = (event) => {
    setGeneral((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const updatePayment = (event) => {
    const { name, type, checked, value } = event.target;
    setPayment((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveGeneralSettings = async () => {
    try {
      await API.put("/api/settings", general);
      setMessage("Shop settings updated successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Failed to save settings");
    }
  };

  const savePaymentSettings = async () => {
    if (!selectedShopId) {
      setMessage("Select a shop first.");
      return;
    }
    if (
      (clearKeySecret || clearWebhookSecret) &&
      !window.confirm(
        "Remove the selected stored secret? This can disable payment processing."
      )
    ) {
      return;
    }

    const payload = {
      paymentEnabled: payment.paymentEnabled,
      paymentMode: payment.paymentMode,
      upiId: payment.upiId,
      razorpayKeyId: payment.razorpayKeyId,
      paymentInstructions: payment.paymentInstructions,
    };
    if (razorpayKeySecret.trim()) {
      payload.razorpayKeySecret = razorpayKeySecret.trim();
    }
    if (razorpayWebhookSecret.trim()) {
      payload.razorpayWebhookSecret = razorpayWebhookSecret.trim();
    }
    if (clearKeySecret) payload.clearRazorpayKeySecret = true;
    if (clearWebhookSecret) payload.clearRazorpayWebhookSecret = true;

    try {
      setSavingPayment(true);
      setMessage("");
      const response = await API.put(
        `/api/shops/${selectedShopId}/payment-settings`,
        payload
      );
      const safe = response.data?.paymentSettings || {};
      setPayment((current) => ({
        ...current,
        paymentEnabled: safe.paymentEnabled !== false,
        paymentMode: safe.paymentMode || "both",
        upiId: safe.upiId || "",
        razorpayKeyId: safe.razorpayKeyId || "",
        paymentInstructions: safe.paymentInstructions || "",
        hasRazorpaySecret: safe.hasRazorpaySecret === true,
        hasWebhookSecret: safe.hasWebhookSecret === true,
        hasLegacyPlaintextSecret: safe.hasLegacyPlaintextSecret === true,
        webhookUrl: safe.webhookUrl || "",
      }));
      setRazorpayKeySecret("");
      setRazorpayWebhookSecret("");
      setClearKeySecret(false);
      setClearWebhookSecret(false);
      setMessage("Payment settings updated successfully.");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Failed to save payment settings"
      );
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mt-5 mb-5">
        {isAdmin && (
          <div className="card shadow mb-4">
            <div className="card-header bg-dark text-white">
              <h3 className="mb-0">Shop Settings</h3>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Shop Name</label>
                  <input className="form-control" name="shopName" value={general.shopName} onChange={updateGeneral} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Phone</label>
                  <input className="form-control" name="phone" value={general.phone} onChange={updateGeneral} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" name="email" value={general.email} onChange={updateGeneral} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Website</label>
                  <input className="form-control" name="website" value={general.website} onChange={updateGeneral} />
                </div>
                <div className="col-12 mb-3">
                  <label className="form-label">Address</label>
                  <textarea className="form-control" rows="3" name="address" value={general.address} onChange={updateGeneral} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label">B&amp;W Price</label>
                  <input type="number" className="form-control" name="blackWhitePrice" value={general.blackWhitePrice} onChange={updateGeneral} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label">Color Price</label>
                  <input type="number" className="form-control" name="colorPrice" value={general.colorPrice} onChange={updateGeneral} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label">A3 Price</label>
                  <input type="number" className="form-control" name="a3Price" value={general.a3Price} onChange={updateGeneral} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label">GST (%)</label>
                  <input type="number" className="form-control" name="gst" value={general.gst} onChange={updateGeneral} />
                </div>
              </div>
              <button className="btn btn-success" onClick={saveGeneralSettings}>
                Save General Settings
              </button>
            </div>
          </div>
        )}

        <div className="card shadow">
          <div className="card-header bg-primary text-white">
            <h4 className="mb-0">Payment Configuration</h4>
          </div>
          <div className="card-body">
            {isAdmin && (
              <div className="mb-3">
                <label className="form-label">Shop</label>
                <select
                  className="form-select"
                  value={selectedShopId}
                  onChange={(event) => setSelectedShopId(event.target.value)}
                >
                  <option value="">Select a shop</option>
                  {shops.map((shop) => (
                    <option key={shop._id} value={shop._id}>
                      {shop.shopName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {loadingPayment ? (
              <div className="text-muted">Loading payment settings...</div>
            ) : selectedShopId ? (
              <>
                <div className="form-check form-switch mb-3">
                  <input
                    id="paymentEnabled"
                    className="form-check-input"
                    type="checkbox"
                    name="paymentEnabled"
                    checked={payment.paymentEnabled}
                    onChange={updatePayment}
                  />
                  <label className="form-check-label" htmlFor="paymentEnabled">
                    Payment enabled
                  </label>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Payment Mode</label>
                    <select
                      className="form-select"
                      name="paymentMode"
                      value={payment.paymentMode}
                      onChange={updatePayment}
                    >
                      <option value="razorpay">Razorpay</option>
                      <option value="upi">UPI QR</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Shop UPI ID</label>
                    <input
                      className="form-control"
                      name="upiId"
                      value={payment.upiId}
                      onChange={updatePayment}
                      placeholder="shop@bank"
                    />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Razorpay Key ID</label>
                    <input
                      className="form-control"
                      name="razorpayKeyId"
                      value={payment.razorpayKeyId}
                      onChange={updatePayment}
                      placeholder="rzp_test_..."
                    />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Razorpay Key Secret{" "}
                      <span className={`badge ${payment.hasRazorpaySecret ? "bg-success" : "bg-secondary"}`}>
                        {payment.hasRazorpaySecret ? "Configured" : "Not configured"}
                      </span>
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      className="form-control"
                      value={razorpayKeySecret}
                      onChange={(event) => setRazorpayKeySecret(event.target.value)}
                      placeholder="Leave blank to keep the stored secret"
                    />
                    {payment.hasRazorpaySecret && (
                      <div className="form-check mt-2">
                        <input
                          id="clearKeySecret"
                          className="form-check-input"
                          type="checkbox"
                          checked={clearKeySecret}
                          onChange={(event) => setClearKeySecret(event.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="clearKeySecret">
                          Remove stored key secret
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Razorpay Webhook Secret{" "}
                      <span className={`badge ${payment.hasWebhookSecret ? "bg-success" : "bg-secondary"}`}>
                        {payment.hasWebhookSecret ? "Configured" : "Not configured"}
                      </span>
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      className="form-control"
                      value={razorpayWebhookSecret}
                      onChange={(event) => setRazorpayWebhookSecret(event.target.value)}
                      placeholder="Leave blank to keep the stored secret"
                    />
                    {payment.hasWebhookSecret && (
                      <div className="form-check mt-2">
                        <input
                          id="clearWebhookSecret"
                          className="form-check-input"
                          type="checkbox"
                          checked={clearWebhookSecret}
                          onChange={(event) => setClearWebhookSecret(event.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="clearWebhookSecret">
                          Remove stored webhook secret
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Webhook URL</label>
                    <input
                      className="form-control"
                      readOnly
                      value={payment.webhookUrl}
                    />
                    <small className="text-muted">
                      Configure this exact URL in this shop's Razorpay dashboard.
                    </small>
                  </div>
                  <div className="col-12 mb-3">
                    <label className="form-label">Customer Payment Instructions</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      name="paymentInstructions"
                      value={payment.paymentInstructions}
                      onChange={updatePayment}
                      maxLength="1000"
                    />
                  </div>
                </div>

                {payment.hasLegacyPlaintextSecret && (
                  <div className="alert alert-warning">
                    This shop has a legacy payment secret. Keep payments disabled and run the guarded encryption migration after a database backup.
                  </div>
                )}

                <button
                  className="btn btn-success"
                  onClick={savePaymentSettings}
                  disabled={savingPayment}
                >
                  {savingPayment ? "Saving..." : "Save Payment Settings"}
                </button>
              </>
            ) : (
              <div className="alert alert-info mb-0">No shop is available.</div>
            )}

            {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

export default ShopSettings;
