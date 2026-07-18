import React from "react";

function Footer() {
  return (
    <footer className="bg-dark text-white text-center py-4 mt-5">
      <div className="container">
        <h5>MSK Print Cloud</h5>

        <p className="mb-2">
          Print smarter. Upload online. Collect with ease.
        </p>

        <small>
          © {new Date().getFullYear()} MSK Print Cloud. All Rights Reserved.
        </small>
      </div>
    </footer>
  );
}

export default Footer;