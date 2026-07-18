import React, { useState } from "react";
import API from "../Services/Api";
import Navbar from "../components/Navbar";

function Upload() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file");
      return;
    }

    setLoading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await API.post("/api/print", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      localStorage.setItem("printJobId", response.data.jobId);

      setLoading(false);

      window.location.href = "/payment";
    } catch (error) {
      console.log(error);
      console.log("Backend Response:", error.response);

      setLoading(false);

      setMessage(
        error.response?.data?.message || "Upload failed"
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

                <input
                  type="file"
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