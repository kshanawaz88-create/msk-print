import React from "react";

function Testimonials() {
  const reviews = [
    {
      name: "Rahul Sharma",
      review:
        "Excellent service! Uploaded my documents and collected them within 20 minutes.",
      rating: "⭐⭐⭐⭐⭐",
    },
    {
      name: "Priya Patel",
      review:
        "Very easy to use. Online payment and email updates made everything convenient.",
      rating: "⭐⭐⭐⭐⭐",
    },
    {
      name: "Amit Kumar",
      review:
        "Professional printing quality and affordable prices. Highly recommended.",
      rating: "⭐⭐⭐⭐⭐",
    },
  ];

  return (
    <section className="py-5 bg-light">
      <div className="container">

        <h2 className="text-center fw-bold mb-3">
          What Our Customers Say
        </h2>

        <p className="text-center text-muted mb-5">
          Trusted by students, professionals, and businesses.
        </p>

        <div className="row">

          {reviews.map((review, index) => (
            <div className="col-md-4 mb-4" key={index}>
              <div className="card shadow border-0 h-100">
                <div className="card-body">

                  <h5>{review.name}</h5>

                  <p className="text-warning">
                    {review.rating}
                  </p>

                  <p className="text-muted">
                    "{review.review}"
                  </p>

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