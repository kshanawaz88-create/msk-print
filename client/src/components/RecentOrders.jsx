import React from "react";

function RecentOrders({ orders }) {
  const recentOrders = [...orders]
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    )
    .slice(0, 5);

  return (
    <div className="card shadow mt-4">
      <div className="card-header bg-dark text-white">
        <h5 className="mb-0">🕒 Recent Orders</h5>
      </div>

      <div className="card-body">

        {recentOrders.length === 0 ? (
          <p>No recent orders.</p>
        ) : (
          <ul className="list-group">

            {recentOrders.map((order) => (
              <li
                key={order._id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <strong>{order.fileName}</strong>
                  <br />
                  <small>
                    {order.user?.fullName || "Customer"}
                  </small>
                </div>

                <span className="badge bg-primary">
                  {order.status}
                </span>
              </li>
            ))}

          </ul>
        )}

      </div>
    </div>
  );
}

export default RecentOrders;