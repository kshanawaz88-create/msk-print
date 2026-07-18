import React from "react";

function StatsCard({
  title,
  value,
  icon,
  bgColor = "primary",
}) {
  return (
    <div className="col-md-3 mb-4">
      <div
        className={`card border-0 shadow bg-${bgColor} text-white`}
        style={{ borderRadius: "15px" }}
      >
        <div className="card-body d-flex justify-content-between align-items-center">

          <div>
            <h6 className="text-uppercase">{title}</h6>
            <h2 className="fw-bold">{value}</h2>
          </div>

          <div style={{ fontSize: "45px" }}>
            {icon}
          </div>

        </div>
      </div>
    </div>
  );
}

export default StatsCard;