import React, { useEffect, useState } from "react";
import API from "../Services/Api";
import Navbar from "../components/Navbar";

function ShopSettings() {
  const [settings, setSettings] = useState({
    shopName: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    blackWhitePrice: 2,
    colorPrice: 10,
    a3Price: 15,
    gst: 18,
    currency: "₹",
    upiId: "",
    openingTime: "",
    closingTime: "",
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await API.get("/api/settings");
      setSettings(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  const handleChange = (e) => {
    setSettings({
      ...settings,
      [e.target.name]: e.target.value,
    });
  };

  const saveSettings = async () => {
    try {
      await API.put("/api/settings", settings);

      setMessage("✅ Shop settings updated successfully!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.log(error);
      setMessage("❌ Failed to save settings");
    }
  };

  return (
    <>
      <Navbar />

      <div className="container mt-5">

        <div className="card shadow">

          <div className="card-header bg-dark text-white">
            <h3>🏪 Shop Settings</h3>
          </div>

          <div className="card-body">

            <div className="row">

              <div className="col-md-6 mb-3">
                <label>Shop Name</label>
                <input
                  type="text"
                  className="form-control"
                  name="shopName"
                  value={settings.shopName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label>Phone</label>
                <input
                  type="text"
                  className="form-control"
                  name="phone"
                  value={settings.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label>Email</label>
                <input
                  type="email"
                  className="form-control"
                  name="email"
                  value={settings.email}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label>Website</label>
                <input
                  type="text"
                  className="form-control"
                  name="website"
                  value={settings.website}
                  onChange={handleChange}
                />
              </div>

              <div className="col-12 mb-3">
                <label>Address</label>
                <textarea
                  className="form-control"
                  rows="3"
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                />
              </div>

              <hr className="my-4" />

              <h5 className="mb-3">💰 Print Pricing</h5>

              <div className="col-md-4 mb-3">
                <label>Black & White Price</label>
                <input
                  type="number"
                  className="form-control"
                  name="blackWhitePrice"
                  value={settings.blackWhitePrice}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label>Color Price</label>
                <input
                  type="number"
                  className="form-control"
                  name="colorPrice"
                  value={settings.colorPrice}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label>A3 Price</label>
                <input
                  type="number"
                  className="form-control"
                  name="a3Price"
                  value={settings.a3Price}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label>GST (%)</label>
                <input
                  type="number"
                  className="form-control"
                  name="gst"
                  value={settings.gst}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label>Currency</label>
                <input
                  type="text"
                  className="form-control"
                  name="currency"
                  value={settings.currency}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label>UPI ID</label>
                <input
                  type="text"
                  className="form-control"
                  name="upiId"
                  value={settings.upiId}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label>Opening Time</label>
                <input
                  type="text"
                  className="form-control"
                  name="openingTime"
                  value={settings.openingTime}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label>Closing Time</label>
                <input
                  type="text"
                  className="form-control"
                  name="closingTime"
                  value={settings.closingTime}
                  onChange={handleChange}
                />
              </div>

            </div>

            {message && (
              <div className="alert alert-info mt-3">
                {message}
              </div>
            )}

            <button
              className="btn btn-success mt-3"
              onClick={saveSettings}
            >
              💾 Save Settings
            </button>

          </div>

        </div>

      </div>
    </>
  );
}

export default ShopSettings;