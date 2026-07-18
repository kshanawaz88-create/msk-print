import React from "react";

function FAQ() {
  const faqs = [
    {
      question: "Which file formats are supported?",
      answer: "You can upload PDF, DOC, DOCX, JPG, JPEG and PNG files.",
    },
    {
      question: "How do I pay?",
      answer: "You can pay securely online before your print job is processed.",
    },
    {
      question: "How will I know my order is ready?",
      answer: "You'll receive email notifications whenever your order status changes.",
    },
    {
      question: "Can I print in color?",
      answer: "Yes. You can choose Black & White or Color printing while placing your order.",
    },
  ];

  return (
    <section className="py-5">
      <div className="container">
        <h2 className="text-center fw-bold mb-5">
          Frequently Asked Questions
        </h2>

        <div className="accordion" id="faqAccordion">
          {faqs.map((faq, index) => (
            <div className="accordion-item" key={index}>
              <h2 className="accordion-header">
                <button
                  className={`accordion-button ${
                    index !== 0 ? "collapsed" : ""
                  }`}
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target={`#faq${index}`}
                >
                  {faq.question}
                </button>
              </h2>

              <div
                id={`faq${index}`}
                className={`accordion-collapse collapse ${
                  index === 0 ? "show" : ""
                }`}
                data-bs-parent="#faqAccordion"
              >
                <div className="accordion-body">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FAQ;