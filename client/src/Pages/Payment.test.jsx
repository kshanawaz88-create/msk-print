import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import API from "../Services/Api";
import Payment from "./Payment";

jest.mock("../Services/Api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const order = {
  _id: "507f1f77bcf86cd799439011",
  fileName: "document.pdf",
  pages: 2,
  copies: 1,
  printType: "Black & White",
  side: "Single Side",
  paperSize: "A4",
  status: "Pending",
  currency: "INR",
};

const arrange = (payment) => {
  localStorage.setItem("printJobId", order._id);
  API.get.mockImplementation((url) => {
    if (url.startsWith("/api/print/")) {
      return Promise.resolve({ data: { success: true, job: order } });
    }
    return Promise.resolve({
      data: {
        success: true,
        shop: { id: "shop-id", shopName: "Tenant Shop" },
        payment,
      },
    });
  });
  API.post.mockResolvedValue({
    data: {
      success: true,
      price: 4,
      breakdown: { total: 4, currency: "INR" },
    },
  });
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Payment />
    </MemoryRouter>
  );
};

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("shows only the UPI method returned for the print job shop", async () => {
  arrange({
    paymentEnabled: true,
    paymentMode: "upi",
    upiId: "tenant@upi",
    paymentInstructions: "Pay the exact quoted amount.",
    razorpayAvailable: false,
    upiAvailable: true,
  });

  expect(await screen.findByText("Tenant Shop")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pay using UPI QR" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
  expect(screen.getByText("Pay the exact quoted amount.", { exact: false })).toBeInTheDocument();
});

test("blocks payment controls when the shop disabled payments", async () => {
  arrange({
    paymentEnabled: false,
    paymentMode: "both",
    upiId: "",
    paymentInstructions: "",
    razorpayAvailable: false,
    upiAvailable: false,
  });

  expect(
    await screen.findByText("Payments are currently disabled for this shop.", {
      exact: false,
    })
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay using UPI QR" })).not.toBeInTheDocument();
});
