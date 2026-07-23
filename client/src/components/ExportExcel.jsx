import React from "react";

const safeCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

function ExportExcel({ orders = [] }) {
  const exportOrders = () => {
    const headers = [
      "Customer", "Email", "File", "Pages", "Copies",
      "Print Type", "Side", "Price", "Payment", "Status", "Date",
    ];
    const rows = orders.map((order) => [
      order.user?.fullName || "N/A",
      order.user?.email || "N/A",
      order.fileName,
      order.pages,
      order.copies,
      order.printType,
      order.side,
      order.price,
      order.paymentStatus,
      order.status,
      order.createdAt ? new Date(order.createdAt).toLocaleString() : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(safeCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "MSK_Print_Orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button className="btn btn-success mb-3" onClick={exportOrders}>
      Export Orders
    </button>
  );
}

export default ExportExcel;
