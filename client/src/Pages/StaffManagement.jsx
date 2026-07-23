import React, { useEffect, useState } from "react";
import API from "../Services/Api";
import Navbar from "../components/Navbar";

const emptyForm = {
  fullName: "",
  email: "",
  password: "",
  shopId: "",
  printerName: "",
  isAvailable: true,
};

function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [shops, setShops] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadStaff();
    loadShops();
  }, []);

  const loadStaff = async () => {
    try {
      const res = await API.get("/api/users/staff");

      if (Array.isArray(res.data)) {
        setStaff(res.data);
      } else if (Array.isArray(res.data.staff)) {
        setStaff(res.data.staff);
      } else if (Array.isArray(res.data.users)) {
        setStaff(res.data.users);
      } else {
        setStaff([]);
      }
    } catch (error) {
      console.log("Load staff error:", error);
      setStaff([]);
    }
  };

  const loadShops = async () => {
    try {
      const res = await API.get("/api/shops");

      if (Array.isArray(res.data)) {
        setShops(res.data);
      } else if (Array.isArray(res.data.shops)) {
        setShops(res.data.shops);
      } else {
        setShops([]);
      }
    } catch (error) {
      console.log("Load shops error:", error);
      setShops([]);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const editStaff = (user) => {
    setFormData({
      fullName: user.fullName || "",
      email: user.email || "",
      password: "",
      shopId:
        typeof user.shopId === "object"
          ? user.shopId?._id || ""
          : user.shopId || "",
      printerName: user.assignedPrinter || "",
      isAvailable: user.isAvailable !== false,
    });

    setEditingId(user._id);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const saveStaff = async (e) => {
    e.preventDefault();

    if (!formData.fullName.trim() || !formData.email.trim()) {
      alert("Full name and email are required.");
      return;
    }

    if (!editingId && formData.password.length < 6) {
      alert("Password must contain at least 6 characters.");
      return;
    }

    if (!formData.shopId) {
      alert("Please select a shop.");
      return;
    }

    try {
      setLoading(true);

      if (editingId) {
        const updateData = {
          fullName: formData.fullName,
          email: formData.email,
          shopId: formData.shopId,
          assignedPrinter: formData.printerName,
          isAvailable: formData.isAvailable,
        };

        if (formData.password.trim()) {
          updateData.password = formData.password;
        }

        await API.put(
          `/api/users/staff/${editingId}`,
          updateData
        );

        alert("Staff updated successfully.");
      } else {
        await API.post("/api/users/staff", {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,

          // Supports your current create-staff route.
          shop: formData.shopId,
          shopId: formData.shopId,

          printerName: formData.printerName,
          assignedPrinter: formData.printerName,
          isAvailable: formData.isAvailable,
        });

        alert("Staff created successfully.");
      }

      resetForm();
      await loadStaff();
    } catch (error) {
      console.log("Save staff error:", error);

      alert(
        error.response?.data?.message ||
          "Unable to save staff."
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteStaff = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this staff member?"
    );

    if (!confirmed) return;

    try {
      await API.delete(`/api/users/staff/${id}`);

      alert("Staff deleted successfully.");
      await loadStaff();
    } catch (error) {
      console.log("Delete staff error:", error);

      alert(
        error.response?.data?.message ||
          "Unable to delete staff."
      );
    }
  };

  const filteredStaff = staff.filter((user) => {
    const text = search.toLowerCase();

    return (
      (user.fullName || "").toLowerCase().includes(text) ||
      (user.email || "").toLowerCase().includes(text) ||
      (user.shopId?.shopName || "")
        .toLowerCase()
        .includes(text) ||
      (user.assignedPrinter || "")
        .toLowerCase()
        .includes(text)
    );
  });

  return (
    <>
    <Navbar />
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">👨‍💼 Staff Management</h2>
          <p className="text-muted mb-0">
            Create staff accounts and assign shops and printers.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-success"
          onClick={openAddForm}
        >
          ➕ Add Staff
        </button>
      </div>

      {showForm && (
        <div className="card shadow mb-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">
              {editingId ? "✏️ Edit Staff" : "➕ Add New Staff"}
            </h5>
          </div>

          <div className="card-body">
            <form onSubmit={saveStaff}>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Full Name</label>

                  <input
                    type="text"
                    className="form-control"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label className="form-label">Email</label>

                  <input
                    type="email"
                    className="form-control"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label className="form-label">
                    Password{" "}
                    {editingId && (
                      <span className="text-muted">
                        (leave blank to keep current password)
                      </span>
                    )}
                  </label>

                  <input
                    type="password"
                    className="form-control"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!editingId}
                    minLength={editingId ? undefined : 6}
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label className="form-label">Shop</label>

                  <select
                    className="form-select"
                    name="shopId"
                    value={formData.shopId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Shop</option>

                    {shops.map((shop) => (
                      <option key={shop._id} value={shop._id}>
                        {shop.shopName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6 mb-3">
                  <label className="form-label">
                    Assigned Printer
                  </label>

                  <select
                    className="form-select"
                    name="printerName"
                    value={formData.printerName}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Printer</option>
                    <option value="Printer 1">Printer 1</option>
                    <option value="Printer 2">Printer 2</option>
                    <option value="Printer 3">Printer 3</option>
                  </select>
                </div>

                <div className="col-md-6 mb-3 d-flex align-items-end">
                  <div className="form-check form-switch mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="staffAvailability"
                      name="isAvailable"
                      checked={formData.isAvailable}
                      onChange={handleChange}
                    />

                    <label
                      className="form-check-label"
                      htmlFor="staffAvailability"
                    >
                      Staff is active and available
                    </label>
                  </div>
                </div>
              </div>

              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading
                    ? "Saving..."
                    : editingId
                    ? "Update Staff"
                    : "Save Staff"}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetForm}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card shadow">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Staff List</h5>

          <span className="badge bg-primary">
            {filteredStaff.length} Staff
          </span>
        </div>

        <div className="card-body">
          <div className="mb-3">
            <input
              type="search"
              className="form-control"
              placeholder="Search staff by name, email, shop or printer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="table-responsive">
            <table className="table table-bordered table-hover align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Shop</th>
                  <th>Printer</th>
                  <th>Status</th>
                  <th style={{ minWidth: "170px" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      No Staff Found
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((user) => (
                    <tr key={user._id}>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>

                      <td>
                        {user.shopId?.shopName || "Not assigned"}
                      </td>

                      <td>
                        {user.assignedPrinter || "Not assigned"}
                      </td>

                      <td>
                        {user.isAvailable !== false ? (
                          <span className="badge bg-success">
                            Active
                          </span>
                        ) : (
                          <span className="badge bg-secondary">
                            Inactive
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn btn-warning btn-sm me-2"
                          onClick={() => editStaff(user)}
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteStaff(user._id)}
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default StaffManagement;
