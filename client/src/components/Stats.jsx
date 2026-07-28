import React from "react";

function Stats() {
  const capabilities = [
    { value: "A4/A3", title: "Paper Sizes", color: "primary" },
    { value: "B&W/Color", title: "Print Types", color: "success" },
    { value: "1/2", title: "Single or Double Side", color: "danger" },
    { value: "5 sec", title: "Tracking Backup Refresh", color: "warning" },
  ];

  return (
    <section className="py-5 bg-dark text-white">
      <div className="container">
        <div className="row text-center">
          {capabilities.map((item) => (
            <div className="col-md-3 mb-4" key={item.title}>
              <h2 className={`text-${item.color} fw-bold`}>{item.value}</h2>
              <h5>{item.title}</h5>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Stats;
