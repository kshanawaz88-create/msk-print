import React, { useState } from "react";
import API from "../Services/Api";

function AddShopModal({ show, onClose, onSuccess }) {
  const [form, setForm] = useState({
    shopName: "",
    ownerName: "",
    email: "",
    phone: "",
    website: "",
    address: "",
  });

  if (!show) return null;

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const createShop = async () => {
    if (!form.shopName || !form.ownerName) {
      alert("Please fill Shop Name and Owner Name");
      return;
    }

    try {
      await API.post("/api/shops", form);

      setForm({
        shopName: "",
        ownerName: "",
        email: "",
        phone: "",
        website: "",
        address: "",
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.log(error);
      alert("Unable to create shop");
    }
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">

        <div className="modal-content">

          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">🏪 Add New Shop</h5>

            <button
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body">

            <div className="row">

              <div className="col-md-6 mb-3">
                <label className="form-label">Shop Name</label>
                <input
                  className="form-control"
                  name="shopName"
                  value={form.shopName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Owner Name</label>
                <input
                  className="form-control"
                  name="ownerName"
                  value={form.ownerName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Phone</label>
                <input
                  className="form-control"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Website</label>
                <input
                  className="form-control"
                  name="website"
                  value={form.website}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Address</label>
                <input
                  className="form-control"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                />
              </div>

            </div>

          </div>

          <div className="modal-footer">

            <button
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              className="btn btn-success"
              onClick={createShop}
            >
              ➕ Create Shop
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}

export default AddShopModal;