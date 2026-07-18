import React from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Pie } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend
);

function StatusChart({ orders }) {
  const pending = orders.filter(
    (order) => order.status === "Pending"
  ).length;

  const printing = orders.filter(
    (order) => order.status === "Printing"
  ).length;

  const ready = orders.filter(
    (order) => order.status === "Ready"
  ).length;

  const completed = orders.filter(
    (order) => order.status === "Completed"
  ).length;

  const data = {
    labels: [
      "Pending",
      "Printing",
      "Ready",
      "Completed",
    ],
    datasets: [
      {
        label: "Orders",
        data: [
          pending,
          printing,
          ready,
          completed,
        ],
      },
    ],
  };

  return (
    <div className="card shadow mt-4">
      <div className="card-body">
        <h5 className="text-center mb-3">
          Order Status Distribution
        </h5>

        <Pie data={data} />
      </div>
    </div>
  );
}

export default StatusChart;