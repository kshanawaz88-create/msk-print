const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "payment-hardening-test-secret-at-least-32";
process.env.SHOP_PAYMENT_ENCRYPTION_KEY = "33".repeat(32);
process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED = "false";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CLIENT_URL = "http://localhost:3000";

const { createApp } = require("../app");
const PrintJob = require("../models/printJob");
const Shop = require("../models/Shop");
const ShopSettings = require("../models/ShopSettings");
const User = require("../models/User");
const paymentService = require("../services/shopPaymentService");
const { encryptShopSecret } = require("../utils/shopPaymentEncryption");

const app = createApp();
const originalRazorpayFactory = paymentService.createRazorpayClient;
const keySecret = "guest-payment-secret";
let mongo;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sign = (orderId, paymentId) => crypto
  .createHmac("sha256", keySecret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");
const auth = (user) => ({
  Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" })}`,
});

const seed = async ({ guest = false, extra = {} } = {}) => {
  const shop = await Shop.create({
    shopName: "Payment Shop",
    ownerName: "Owner",
    email: `shop-${crypto.randomUUID()}@example.com`,
    paymentEnabled: true,
    paymentMode: "both",
    upiId: "payments@upi",
    razorpayKeyId: "rzp_test_payment123",
  });
  shop.razorpayKeySecretEncrypted = encryptShopSecret(
    keySecret,
    `shop:${shop._id}:razorpay-key-secret`
  );
  await shop.save();
  await ShopSettings.create({
    shopId: shop._id,
    blackWhitePrice: 2,
    colorPrice: 10,
    a3Price: 15,
    gst: 0,
  });
  const customer = await User.create({
    fullName: "Payment Customer",
    email: `customer-${crypto.randomUUID()}@example.com`,
    password: "secret12",
  });
  const admin = await User.create({
    fullName: "Payment Admin",
    email: `admin-${crypto.randomUUID()}@example.com`,
    password: "secret12",
    role: "admin",
  });
  const publicToken = crypto.randomBytes(32).toString("hex");
  const job = await PrintJob.create({
    shopId: shop._id,
    user: guest ? null : customer._id,
    isGuestOrder: guest,
    publicOrderTokenHash: guest ? sha256(publicToken) : undefined,
    publicOrderExpiresAt: guest ? new Date(Date.now() + 60_000) : undefined,
    fileName: "payment.pdf",
    pages: 2,
    copies: 1,
    printType: "Black & White",
    side: "Single Side",
    paperSize: "A4",
    price: 4,
    ...extra,
  });
  return { shop, customer, admin, publicToken, job };
};

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await PrintJob.init();
});

test.afterEach(async () => {
  paymentService.createRazorpayClient = originalRazorpayFactory;
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("guest Razorpay create and verify use the protected order token and are idempotent", async () => {
  const { shop, publicToken, job } = await seed({ guest: true });
  let createCalls = 0;
  paymentService.createRazorpayClient = () => ({
    orders: {
      create: async (payload) => {
        createCalls += 1;
        return { id: "order_guest", ...payload, status: "created" };
      },
    },
  });

  const access = { orderToken: publicToken, shopCode: shop.shopCode };
  const created = await request(app).post("/api/public/payment/create-order").send(access);
  const duplicateCreate = await request(app).post("/api/public/payment/create-order").send(access);
  assert.equal(created.status, 201);
  assert.equal(duplicateCreate.status, 200);
  assert.equal(created.body.order.amount, 400);
  assert.equal(createCalls, 1);

  const verification = {
    ...access,
    razorpay_order_id: "order_guest",
    razorpay_payment_id: "pay_guest",
    razorpay_signature: sign("order_guest", "pay_guest"),
  };
  const invalid = await request(app)
    .post("/api/public/payment/verify")
    .send({ ...verification, razorpay_signature: "not-a-valid-signature" });
  assert.equal(invalid.status, 400);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Pending");

  const paid = await request(app).post("/api/public/payment/verify").send(verification);
  const duplicateVerify = await request(app).post("/api/public/payment/verify").send(verification);
  assert.equal(paid.status, 200);
  assert.equal(duplicateVerify.status, 200);
  const saved = await PrintJob.findById(job._id);
  assert.equal(saved.paymentStatus, "Paid");
  assert.equal(saved.razorpayPaymentId, "pay_guest");
  assert.ok(saved.invoiceNumber);
});

test("concurrent Razorpay creation reserves a job before calling the provider", async () => {
  const { customer, job } = await seed();
  let createCalls = 0;
  paymentService.createRazorpayClient = () => ({
    orders: {
      create: async (payload) => {
        createCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 75));
        return { id: "order_concurrent", ...payload, status: "created" };
      },
    },
  });
  const payload = {
    printJobId: job._id,
    copies: 1,
    printType: "Black & White",
    side: "Single Side",
    paperSize: "A4",
  };
  const [first, second] = await Promise.all([
    request(app).post("/api/payment/create-order").set(auth(customer)).send(payload),
    request(app).post("/api/payment/create-order").set(auth(customer)).send(payload),
  ]);
  assert.equal(createCalls, 1);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  assert.equal((await PrintJob.findById(job._id)).razorpayOrderId, "order_concurrent");
});

test("an initiated manual payment cannot be replaced by a stale Razorpay order", async () => {
  const { customer, job } = await seed({
    extra: { paymentMethod: "UPI", upiReference: "LOCKED123", paymentStatus: "Pending" },
  });
  let createCalls = 0;
  paymentService.createRazorpayClient = () => ({
    orders: { create: async () => { createCalls += 1; return {}; } },
  });

  const response = await request(app)
    .post("/api/payment/create-order")
    .set(auth(customer))
    .send({
      printJobId: job._id,
      copies: 1,
      printType: "Black & White",
      side: "Single Side",
      paperSize: "A4",
    });
  assert.equal(response.status, 409);
  assert.match(response.body.message, /UPI payment in progress/);
  assert.equal(createCalls, 0);
  assert.equal((await PrintJob.findById(job._id)).upiReference, "LOCKED123");
});

test("captured Razorpay payment on a cancelled order is recorded without re-queuing it", async () => {
  const { customer, job } = await seed({
    extra: {
      paymentMethod: "Razorpay",
      razorpayOrderId: "order_cancelled",
      razorpayAmount: 400,
      status: "Cancelled",
    },
  });
  const response = await request(app)
    .post("/api/payment/verify")
    .set(auth(customer))
    .send({
      printJobId: job._id,
      razorpay_order_id: "order_cancelled",
      razorpay_payment_id: "pay_cancelled",
      razorpay_signature: sign("order_cancelled", "pay_cancelled"),
    });
  assert.equal(response.status, 200);
  const saved = await PrintJob.findById(job._id);
  assert.equal(saved.paymentStatus, "Paid");
  assert.equal(saved.status, "Cancelled");
  assert.match(saved.paymentNotes, /refund review/i);
});

test("UPI approval and rejection are atomic, idempotent, and do not approve cancelled orders", async () => {
  const { admin, job } = await seed({
    extra: { paymentMethod: "UPI", upiReference: "APPROVE123" },
  });
  const approve = () => request(app)
    .patch(`/api/payment/upi/${job._id}/verify`)
    .set(auth(admin))
    .send({ decision: "approve" });
  const first = await approve();
  const second = await approve();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const cancelled = await PrintJob.create({
    shopId: job.shopId,
    user: job.user,
    fileName: "cancelled-upi.pdf",
    pages: 1,
    price: 2,
    paymentMethod: "UPI",
    upiReference: "CANCELLED123",
    status: "Cancelled",
  });
  const denied = await request(app)
    .patch(`/api/payment/upi/${cancelled._id}/verify`)
    .set(auth(admin))
    .send({ decision: "approve" });
  assert.equal(denied.status, 409);
  const saved = await PrintJob.findById(cancelled._id);
  assert.equal(saved.paymentStatus, "Pending");
  assert.equal(saved.status, "Cancelled");
});

test("cash review supports an authorized, bounded, idempotent rejection", async () => {
  const { admin, job } = await seed({ extra: { paymentMethod: "Cash" } });
  const reject = () => request(app)
    .patch(`/api/payment/cash/${job._id}/verify`)
    .set(auth(admin))
    .send({ decision: "reject", notes: "Customer did not pay" });
  const first = await reject();
  const second = await reject();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Rejected");

  const tooLong = await seed({ extra: { paymentMethod: "Cash" } });
  const invalid = await request(app)
    .patch(`/api/payment/cash/${tooLong.job._id}/verify`)
    .set(auth(tooLong.admin))
    .send({ decision: "approve", notes: "x".repeat(501) });
  assert.equal(invalid.status, 400);
});
