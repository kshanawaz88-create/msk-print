import React from "react";

function Testimonials() {
  const useCases = [
    {
      title: "Students",
      text: "Upload notes and assignments, select print settings, and track the order for pickup.",
    },
    {
      title: "Professionals",
      text: "Send PDF or image documents to a selected shop without waiting at the upload counter.",
    },
    {
      title: "Print Shops",
      text: "Manage paid print queues, staff assignment, payment review, and order progress in one place.",
    },
  ];

  return (
    <section className="py-5 bg-light">
      <div className="container">
        <h2 className="text-center fw-bold mb-3">Built for Everyday Print Jobs</h2>
        <p className="text-center text-muted mb-5">
          A clear workflow for customers, staff, and shop owners.
        </p>
        <div className="row">
          {useCases.map((item) => (
            <div className="col-md-4 mb-4" key={item.title}>
              <div className="card shadow border-0 h-100">
                <div className="card-body">
                  <h5>{item.title}</h5>
                  <p className="text-muted mb-0">{item.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Testimonials;
