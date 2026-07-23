import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function RevenueChart({ orders }) {
  const monthlyRevenue = {};

  orders.forEach((order) => {
    if (order.paymentStatus !== "Paid") return;
    const month = new Date(order.createdAt).toLocaleString("default", {
      month: "short",
    });

    monthlyRevenue[month] =
      (monthlyRevenue[month] || 0) + (order.price || 0);
  });

  const data = {
    labels: Object.keys(monthlyRevenue),
    datasets: [
      {
        label: "Revenue (₹)",
        data: Object.values(monthlyRevenue),
        backgroundColor: "rgba(54,162,235,0.6)",
        borderColor: "rgba(54,162,235,1)",
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Monthly Revenue",
      },
    },
  };

  return <Bar data={data} options={options} />;
}

export default RevenueChart;
