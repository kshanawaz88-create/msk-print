import React from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function ExportExcel({ orders }) {
  const exportToExcel = () => {
    const data = orders.map((order) => ({
      Customer: order.user?.fullName || "N/A",
      Email: order.user?.email || "N/A",
      File: order.fileName,
      Pages: order.pages,
      Copies: order.copies,
      "Print Type": order.printType,
      Side: order.side,
      Price: order.price,
      Status: order.status,
      Date: new Date(order.createdAt).toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, "MSK_Print_Orders.xlsx");
  };

  return (
    <button
      className="btn btn-success mb-3"
      onClick={exportToExcel}
    >
      📥 Export Orders to Excel
    </button>
  );
}

export default ExportExcel;