import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../Services/Api";
import { getStoredUser } from "../Services/session";
import Navbar from "../components/Navbar";

function Upload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const user = useMemo(() => getStoredUser(), []);
  const userShopId = typeof user?.shopId === "object"
    ? user.shopId?._id
    : user?.shopId;
  const needsShopSelection =
    user?.role === "admin" || (user?.role === "customer" && !userShopId);

  useEffect(() => {
    if (!needsShopSelection) return;
    let active = true;
    API.get("/api/shops")
      .then((response) => {
        if (!active) return;
        const available = Array.isArray(response.data?.shops)
          ? response.data.shops
          : [];
        setShops(available);
        if (available.length === 1) setShopId(available[0]._id);
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error.response?.data?.message || "Unable to load available shops"
          );
        }
      });
    return () => {
      active = false;
    };
  }, [needsShopSelection]);

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file");
      return;
    }
    if (needsShopSelection && shops.length > 1 && !shopId) {
      setMessage("Select the shop that should receive this print order");
      return;
    }
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      setMessage("Only PDF, PNG and JPG files are supported");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage("File size cannot exceed 20 MB");
      return;
    }

    setLoading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    if (shopId) formData.append("shopId", shopId);

    try {
      const response = await API.post("/api/print", formData);
      const jobId = response.data?.job?._id;
      if (!jobId) {
        throw new Error("Upload succeeded but no print job ID was returned");
      }

      localStorage.setItem("printJobId", jobId);
      localStorage.setItem("currentOrderId", jobId);

      setLoading(false);

      navigate("/payment");
    } catch (error) {
      setLoading(false);

      setMessage(
        error.response?.data?.message || error.message || "Upload failed"
      );
    }
  };

  return (
    <>
      <Navbar />

      <div className="container mt-5">

        <div className="row justify-content-center">

          <div className="col-md-8">

            <div className="card shadow-lg border-0">

              <div className="card-header bg-primary text-white">
                <h3 className="mb-0">📤 Upload Print File</h3>
              </div>

              <div className="card-body">

                <p>
                  Upload your PDF or document and continue to payment.
                </p>

                {needsShopSelection && (
                  <div className="mb-3">
                    <label className="form-label">Print Shop</label>
                    <select
                      className="form-select"
                      value={shopId}
                      onChange={(event) => setShopId(event.target.value)}
                    >
                      <option value="">Select a shop</option>
                      {shops.map((shop) => (
                        <option key={shop._id} value={shop._id}>
                          {shop.shopName}
                          {shop.branchName ? ` - ${shop.branchName}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="form-control"
                  onChange={(e) => setFile(e.target.files[0])}
                />

                <button
                  className="btn btn-primary mt-4 w-100"
                  onClick={handleUpload}
                  disabled={loading}
                >
                  {loading
                    ? "⏳ Uploading... Please wait"
                    : "Continue to Payment →"}
                </button>

                {message && (
                  <div className="alert alert-danger mt-3">
                    {message}
                  </div>
                )}

              </div>

            </div>

          </div>

        </div>

      </div>
    </>
  );
}

export default Upload;
