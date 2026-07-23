import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import API from "../Services/Api";

function PublicShop() {
  const { shopCode } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [file, setFile] = useState(null);

  const [copies, setCopies] = useState(1);
  const [printType, setPrintType] =
    useState("Black & White");
  const [side, setSide] =
    useState("Single Side");
  const [paperSize, setPaperSize] =
    useState("A4");

  const [price, setPrice] = useState(0);
  const [pages, setPages] = useState(1);

  const [loading, setLoading] =
    useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [quoting, setQuoting] =
    useState(false);
  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    const loadShop = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await API.get(
          `/api/public/shops/${encodeURIComponent(
            shopCode
          )}`
        );

        if (!active) return;

        setShop(response.data?.shop || null);
      } catch (requestError) {
        if (!active) return;

        setError(
          requestError.response?.data?.message ||
            "Unable to load this shop."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadShop();

    return () => {
      active = false;
    };
  }, [shopCode]);

  const fullAddress = useMemo(() => {
    if (!shop) return "";

    return [
      shop.address,
      shop.city,
      shop.state,
      shop.postalCode,
      shop.country,
    ]
      .filter(Boolean)
      .join(", ");
  }, [shop]);

  useEffect(() => {
    if (!shop || !file) {
      setPrice(0);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setQuoting(true);

        const response = await API.post(
          `/api/public/shops/${encodeURIComponent(
            shop.shopCode
          )}/quote`,
          {
            pages,
            copies,
            printType,
            side,
            paperSize,
          }
        );

        setPrice(
          Number(
            response.data?.quote?.total ??
              response.data?.price ??
              0
          )
        );
      } catch (requestError) {
        setPrice(0);

        setError(
          requestError.response?.data?.message ||
            "Unable to calculate price."
        );
      } finally {
        setQuoting(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    shop,
    file,
    pages,
    copies,
    printType,
    side,
    paperSize,
  ]);

  const submitOrder = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Please select a file.");
      return;
    }

    if (!shop?.paymentEnabled) {
      setError(
        "Online payment is currently disabled for this shop."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const formData = new FormData();

      formData.append("file", file);
      formData.append(
        "copies",
        String(Math.max(Number(copies) || 1, 1))
      );
      formData.append("printType", printType);
      formData.append("side", side);
      formData.append("paperSize", paperSize);

      const response = await API.post(
        `/api/public/shops/${encodeURIComponent(
          shop.shopCode
        )}/orders`,
        formData
      );

      const orderToken =
        response.data?.orderToken ||
        response.data?.order?.orderToken;

      if (!orderToken) {
        throw new Error(
          "Order was created, but no order token was returned."
        );
      }

      localStorage.setItem(
        "publicOrderToken",
        orderToken
      );

      navigate(
        `/shop/${encodeURIComponent(
          shop.shopCode
        )}/payment/${encodeURIComponent(
          orderToken
        )}`
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          "Unable to create print order."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div
          className="spinner-border text-primary"
          role="status"
        />

        <p className="mt-3">
          Loading shop...
        </p>
      </div>
    );
  }

  if (error && !shop) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger text-center">
          <h4>Shop Unavailable</h4>

          <p className="mb-0">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!shop) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f6f9",
      }}
    >
      <header
        className="text-white py-4 shadow-sm"
        style={{
          backgroundColor:
            shop.themeColor || "#0d6efd",
        }}
      >
        <div className="container">
          <div className="d-flex align-items-center gap-3">
            {shop.logo && (
              <img
                src={shop.logo}
                alt={`${shop.shopName} logo`}
                style={{
                  width: "70px",
                  height: "70px",
                  objectFit: "contain",
                  background: "white",
                  borderRadius: "12px",
                  padding: "6px",
                }}
              />
            )}

            <div>
              <h1 className="mb-1">
                {shop.shopName}
              </h1>

              <p className="mb-0">
                {shop.branchName ||
                  "Print Shop"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-9">
            <div className="card shadow border-0">
              <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                  <div
                    style={{
                      fontSize: "64px",
                    }}
                  >
                    🖨️
                  </div>

                  <h2>
                    Upload, Pay and Print
                  </h2>

                  <p className="text-muted">
                    No login required.
                  </p>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <div className="border rounded p-3 h-100">
                      <strong>
                        📍 Shop Address
                      </strong>

                      <p className="mb-0 mt-2 text-muted">
                        {fullAddress ||
                          "Address not available"}
                      </p>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="border rounded p-3 h-100">
                      <strong>
                        🕐 Working Hours
                      </strong>

                      <p className="mb-0 mt-2 text-muted">
                        {shop.openingTime ||
                          "09:00 AM"}
                        {" – "}
                        {shop.closingTime ||
                          "08:00 PM"}
                      </p>
                    </div>
                  </div>
                </div>

                {!shop.paymentEnabled && (
                  <div className="alert alert-warning">
                    Online payment is currently
                    unavailable for this shop.
                  </div>
                )}

                {error && (
                  <div className="alert alert-danger">
                    {error}
                  </div>
                )}

                <form onSubmit={submitOrder}>
                  <div className="mb-4">
                    <label className="form-label">
                      Select document
                    </label>

                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const selectedFile =
                          event.target.files?.[0] ||
                          null;

                        setFile(selectedFile);
                        setPages(1);
                        setError("");
                      }}
                      required
                    />

                    <div className="form-text">
                      PDF, JPG or PNG. Maximum 20 MB.
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-3 mb-3">
                      <label className="form-label">
                        Copies
                      </label>

                      <input
                        type="number"
                        min="1"
                        max="999"
                        className="form-control"
                        value={copies}
                        onChange={(event) =>
                          setCopies(
                            Math.max(
                              Number(
                                event.target.value
                              ) || 1,
                              1
                            )
                          )
                        }
                      />
                    </div>

                    <div className="col-md-3 mb-3">
                      <label className="form-label">
                        Print Type
                      </label>

                      <select
                        className="form-select"
                        value={printType}
                        onChange={(event) =>
                          setPrintType(
                            event.target.value
                          )
                        }
                      >
                        <option value="Black & White">
                          Black & White
                        </option>

                        <option value="Color">
                          Color
                        </option>
                      </select>
                    </div>

                    <div className="col-md-3 mb-3">
                      <label className="form-label">
                        Printing Side
                      </label>

                      <select
                        className="form-select"
                        value={side}
                        onChange={(event) =>
                          setSide(
                            event.target.value
                          )
                        }
                      >
                        <option value="Single Side">
                          Single Side
                        </option>

                        <option value="Double Side">
                          Double Side
                        </option>
                      </select>
                    </div>

                    <div className="col-md-3 mb-3">
                      <label className="form-label">
                        Paper Size
                      </label>

                      <select
                        className="form-select"
                        value={paperSize}
                        onChange={(event) =>
                          setPaperSize(
                            event.target.value
                          )
                        }
                      >
                        <option value="A4">
                          A4
                        </option>

                        <option value="A3">
                          A3
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="alert alert-info">
                    <div className="d-flex justify-content-between align-items-center">
                      <span>
                        Estimated Total
                      </span>

                      <strong className="fs-4">
                        {quoting
                          ? "Calculating..."
                          : `${shop.currency || "₹"}${price}`}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg w-100"
                    disabled={
                      submitting ||
                      quoting ||
                      !file ||
                      !shop.paymentEnabled
                    }
                    style={{
                      backgroundColor:
                        shop.themeColor ||
                        "#0d6efd",
                      borderColor:
                        shop.themeColor ||
                        "#0d6efd",
                    }}
                  >
                    {submitting
                      ? "Creating Order..."
                      : "Continue to Payment →"}
                  </button>
                </form>

                <p className="text-center text-muted small mt-3 mb-0">
                  Shop code: {shop.shopCode}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default PublicShop;