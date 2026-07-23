import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import API from "../Services/Api";
import Invoice from "./Invoice";

jest.mock("../Services/Api", () => ({
  get: jest.fn(),
}));

test("renders invoice details returned by the backend", async () => {
  API.get.mockResolvedValueOnce({
    data: {
      success: true,
      invoice: {
        id: "507f1f77bcf86cd799439011",
        invoiceNumber: "MSK-20260718-507F1F77BCF86CD799439011",
        invoiceDate: "2026-07-18T10:00:00.000Z",
        shop: { name: "Shop A", branchName: "Main Branch", address: "", phone: "", email: "", gstNumber: "", logo: "" },
        customer: { name: "Customer A", email: "a@example.com" },
        order: { fileName: "document.pdf", pages: 2, copies: 1, paperSize: "A4", printType: "Black & White", side: "Single Side", status: "Ready" },
        amounts: { subtotal: 4, gstRate: 0, gstAmount: 0, total: 4, currency: "INR" },
        payment: { method: "UPI", status: "Paid", upiReference: "UPI123456", razorpayPaymentId: "" },
      },
    },
  });

  render(
    <MemoryRouter
      initialEntries={["/invoice/507f1f77bcf86cd799439011"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/invoice/:id" element={<Invoice />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("MSK-20260718-507F1F77BCF86CD799439011")).toBeInTheDocument();
  expect(screen.getByText("document.pdf")).toBeInTheDocument();
  expect(screen.getByText("UPI123456", { exact: false })).toBeInTheDocument();
});
