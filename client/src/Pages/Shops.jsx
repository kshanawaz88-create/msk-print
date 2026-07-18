import React, { useEffect, useState } from "react";
import API from "../Services/Api";
import Navbar from "../components/Navbar";
import AddShopModal from "../components/AddShopModal";

function Shops() {
  const [shops, setShops] = useState([]);
  const [showModal, setShowModal] = useState(false);

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
    console.log(error);
    setShops([]);
  }
};

  useEffect(() => {
    loadShops();
  }, []);

  const deleteShop = async (id) => {
    if (!window.confirm("Delete this shop?")) return;

    try {
      await API.delete(`/api/shops/${id}`);
      loadShops();
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <Navbar />

      <div className="container mt-5">

        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>🏪 Shop Management</h2>

          <button
            className="btn btn-success"
            onClick={() => setShowModal(true)}
          >
            ➕ Add Shop
          </button>
        </div>

        <AddShopModal
          show={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={loadShops}
        />

        <div className="card shadow">

          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">All Shops</h5>
          </div>

          <div className="card-body table-responsive">

            <table className="table table-hover align-middle">

              <thead className="table-dark">
                <tr>
                  <th>Shop</th>
                  <th>Owner</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {shops.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center">
                      No Shops Found
                    </td>
                  </tr>
                ) : (
                  shops.map((shop) => (
                    <tr key={shop._id}>
                      <td>{shop.shopName}</td>
                      <td>{shop.ownerName}</td>
                      <td>{shop.email}</td>
                      <td>{shop.phone}</td>

                      <td>
                        {shop.isActive ? (
                          <span className="badge bg-success">
                            Active
                          </span>
                        ) : (
                          <span className="badge bg-danger">
                            Inactive
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteShop(shop._id)}
                        >
                          Delete
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
    </>
  );
}

export default Shops;