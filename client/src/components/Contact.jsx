import React from "react";
import { FaMapMarkerAlt, FaPhoneAlt, FaEnvelope, FaClock } from "react-icons/fa";

function Contact() {
  return (
    <section className="py-5 bg-light">
      <div className="container">

        <h2 className="text-center fw-bold mb-5">
          Contact Us
        </h2>

        <div className="row">

          <div className="col-md-6">

            <div className="card shadow border-0 p-4 h-100">

              <h4 className="mb-4">MSK Print Cloud</h4>

              <p>
                <FaMapMarkerAlt className="text-danger me-2" />
                Hyderabad, Telangana, India
              </p>

              <p>
                <FaPhoneAlt className="text-success me-2" />
                +91 XXXXX XXXXX
              </p>

              <p>
                <FaEnvelope className="text-primary me-2" />
                support@mskprintcloud.com
              </p>

              <p>
                <FaClock className="text-warning me-2" />
                Monday – Saturday
                <br />
                9:00 AM – 8:00 PM
              </p>

            </div>

          </div>

          <div className="col-md-6">

            <div className="ratio ratio-4x3 shadow">

              <iframe
                title="Google Map"
                src="https://www.google.com/maps?q=Hyderabad&output=embed"
                loading="lazy"
              ></iframe>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

export default Contact;