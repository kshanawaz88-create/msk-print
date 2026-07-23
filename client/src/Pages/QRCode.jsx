import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { QRCodeSVG } from "qrcode.react";

import API from "../Services/Api";
import Navbar from "../components/Navbar";

function QRCodePage() {
  const qrWrapperRef = useRef(null);

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadShop = async () => {
      try {
        setLoading(true);
        setError("");

        const storedUser = JSON.parse(
          localStorage.getItem("user") || "null"
        );

        let shopId = storedUser?.shopId || null;

        if (storedUser?.role === "admin" && !shopId) {
          const shopsResponse = await API.get("/api/shops");

          const activeShops = (
            shopsResponse.data?.shops || []
          ).filter((item) => item.isActive !== false);

          if (activeShops.length === 0) {
            throw new Error(
              "No active shop is available."
            );
          }

          shopId = activeShops[0]._id;
        }

        if (!shopId) {
          throw new Error(
            "Your account is not connected to a shop."
          );
        }

        const response = await API.get(
          `/api/shops/${encodeURIComponent(shopId)}`
        );

        if (!active) return;

        const shopData =
          response.data?.shop || response.data;

        if (!shopData?.shopCode) {
          throw new Error(
            "This shop does not have a shop code."
          );
        }

        setShop(shopData);
      } catch (requestError) {
        if (!active) return;

        setError(
          requestError.response?.data?.message ||
            requestError.message ||
            "Unable to load shop QR code."
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
  }, []);

  const publicShopUrl = useMemo(() => {
    if (!shop?.shopCode) return "";

    const configuredUrl =
      process.env.REACT_APP_CLIENT_URL ||
      window.location.origin;

    return `${configuredUrl.replace(/\/$/, "")}/shop/${encodeURIComponent(
      shop.shopCode
    )}`;
  }, [shop]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicShopUrl);

      setMessage("Public shop link copied.");

      setTimeout(() => {
        setMessage("");
      }, 2500);
    } catch {
      setError("Unable to copy the link.");
    }
  };

  const downloadQr = () => {
    const svg =
      qrWrapperRef.current?.querySelector("svg");

    if (!svg) {
      setError("QR code is not ready.");
      return;
    }

    const serializedSvg =
      new XMLSerializer().serializeToString(svg);

    const svgBlob = new Blob(
      [serializedSvg],
      {
        type: "image/svg+xml;charset=utf-8",
      }
    );

    const objectUrl =
      URL.createObjectURL(svgBlob);

    const image = new Image();

    image.onload = () => {
      const canvas =
        document.createElement("canvas");

      const padding = 40;

      canvas.width = image.width + padding * 2;
      canvas.height = image.height + padding * 2;

      const context = canvas.getContext("2d");

      context.fillStyle = "#ffffff";
      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.drawImage(
        image,
        padding,
        padding
      );

      URL.revokeObjectURL(objectUrl);

      const pngUrl =
        canvas.toDataURL("image/png");

      const downloadLink =
        document.createElement("a");

      downloadLink.href = pngUrl;
      downloadLink.download = `${
        shop.shopCode || "shop"
      }-qr-code.png`;

      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("Unable to create QR image.");
    };

    image.src = objectUrl;
  };

  const printPoster = () => {
    const printWindow = window.open(
      "",
      "_blank",
      "width=900,height=1000"
    );

    if (!printWindow) {
      setError(
        "Please allow pop-ups to print the QR poster."
      );
      return;
    }

    const svg =
      qrWrapperRef.current?.querySelector("svg");

    const qrMarkup = svg
      ? new XMLSerializer().serializeToString(svg)
      : "";

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${shop.shopName} QR Poster</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #111827;
            }

            .poster {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              padding: 25mm 18mm;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            h1 {
              font-size: 42px;
              margin: 0 0 14px;
            }

            h2 {
              font-size: 28px;
              margin: 0 0 20px;
            }

            .subtitle {
              font-size: 22px;
              margin-bottom: 28px;
            }

            .qr-box {
              padding: 24px;
              background: #ffffff;
              border: 4px solid #111827;
              border-radius: 18px;
              margin-bottom: 24px;
            }

            .shop-name {
              font-size: 30px;
              font-weight: bold;
              margin-bottom: 10px;
            }

            .shop-code {
              font-size: 20px;
              margin-bottom: 18px;
            }

            .steps {
              margin-top: 20px;
              font-size: 22px;
              line-height: 1.7;
            }

            .link {
              margin-top: 24px;
              font-size: 16px;
              word-break: break-all;
            }

            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          <div class="poster">
            <h1>🖨️ PRINT HERE</h1>

            <h2>Scan this QR Code</h2>

            <div class="subtitle">
              Upload your document and place your print order
            </div>

            <div class="qr-box">
              ${qrMarkup}
            </div>

            <div class="shop-name">
              ${shop.shopName}
            </div>

            <div class="shop-code">
              Shop Code: ${shop.shopCode}
            </div>

            <div class="steps">
              📄 Upload PDF or photo<br />
              ⚙️ Choose copies and print settings<br />
              💳 Pay online or pay at shop<br />
              🖨️ Collect your print
            </div>

            <div class="link">
              ${publicShopUrl}
            </div>
          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  if (loading) {
    return (
      <>
        <Navbar />

        <div className="container py-5 text-center">
          <div
            className="spinner-border text-primary"
            role="status"
          />

          <p className="mt-3">
            Loading QR code...
          </p>
        </div>
      </>
    );
  }

  if (error && !shop) {
    return (
      <>
        <Navbar />

        <div className="container py-5">
          <div className="alert alert-danger">
            {error}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div
        style={{
          minHeight: "100vh",
          background: "#f4f6f9",
        }}
      >
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <div className="card shadow border-0">
                <div className="card-header bg-dark text-white">
                  <h3 className="mb-0">
                    Shop QR Code
                  </h3>
                </div>

                <div className="card-body p-4 p-md-5">
                  {message && (
                    <div className="alert alert-success">
                      {message}
                    </div>
                  )}

                  {error && (
                    <div className="alert alert-danger">
                      {error}
                    </div>
                  )}

                  <div className="text-center mb-4">
                    <h2>{shop.shopName}</h2>

                    <p className="text-muted">
                      Customers can scan this QR code to upload
                      and print documents.
                    </p>
                  </div>

                  <div
                    ref={qrWrapperRef}
                    className="d-flex justify-content-center mb-4"
                  >
                    <div className="bg-white border rounded p-4">
                      <QRCodeSVG
                        value={publicShopUrl}
                        size={280}
                        level="H"
                        includeMargin
                        title={`${shop.shopName} print QR code`}
                      />
                    </div>
                  </div>

                  <div className="border rounded p-3 mb-4">
                    <div className="mb-3">
                      <strong>Shop Code</strong>

                      <div className="mt-1">
                        {shop.shopCode}
                      </div>
                    </div>

                    <div>
                      <strong>Public Link</strong>

                      <div className="input-group mt-2">
                        <input
                          type="text"
                          className="form-control"
                          value={publicShopUrl}
                          readOnly
                        />

                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={copyLink}
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <button
                        type="button"
                        className="btn btn-primary btn-lg w-100"
                        onClick={downloadQr}
                      >
                        Download QR PNG
                      </button>
                    </div>

                    <div className="col-md-6">
                      <button
                        type="button"
                        className="btn btn-dark btn-lg w-100"
                        onClick={printPoster}
                      >
                        Print A4 Poster
                      </button>
                    </div>
                  </div>

                  <a
                    href={publicShopUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline-success btn-lg w-100 mt-3"
                  >
                    Open Public Shop Page
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default QRCodePage;