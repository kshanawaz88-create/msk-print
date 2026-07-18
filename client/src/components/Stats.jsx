import React from "react";
import CountUp from "react-countup";

function Stats() {
  const stats = [
    {
      number: 500,
      suffix: "+",
      title: "Orders Printed",
      color: "primary",
    },
    {
      number: 150,
      suffix: "+",
      title: "Happy Customers",
      color: "success",
    },
    {
      number: 99,
      suffix: "%",
      title: "Success Rate",
      color: "danger",
    },
    {
      number: 24,
      suffix: "/7",
      title: "Support",
      color: "warning",
    },
  ];

  return (
    <section className="py-5 bg-dark text-white">
      <div className="container">
        <div className="row text-center">

          {stats.map((item, index) => (
            <div className="col-md-3 mb-4" key={index}>
              <h2 className={`text-${item.color} fw-bold`}>
                <CountUp
                  end={item.number}
                  duration={3}
                />
                {item.suffix}
              </h2>

              <h5>{item.title}</h5>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}

export default Stats;