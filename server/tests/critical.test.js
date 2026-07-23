const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Writable } = require("node:stream");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-characters";
process.env.SHOP_PAYMENT_ENCRYPTION_KEY = "11".repeat(32);
process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED = "false";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CLIENT_URL = "http://localhost:3000";

const { createApp } = require("../app");
const User = require("../models/User");
const Shop = require("../models/Shop");
const ShopSettings = require("../models/ShopSettings");
const PrintJob = require("../models/printJob");
const cloudinary = require("../config/cloudinary");
const paymentService = require("../services/shopPaymentService");
const {
  decodeEncryptionKey,
  decryptShopSecret,
  encryptShopSecret,
} = require("../utils/shopPaymentEncryption");

const app = createApp();
let mongo;

const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const SHOP_A_KEY_SECRET = "shop-a-razorpay-secret";
const SHOP_B_KEY_SECRET = "shop-b-razorpay-secret";
const SHOP_A_WEBHOOK_SECRET = "shop-a-webhook-secret";
const SHOP_B_WEBHOOK_SECRET = "shop-b-webhook-secret";

const configureShopPayments = async (
  shop,
  { keyId, keySecret, webhookSecret, upiId }
) => {
  shop.paymentMode = "both";
  shop.paymentEnabled = true;
  shop.upiId = upiId;
  shop.razorpayKeyId = keyId;
  shop.razorpayKeySecretEncrypted = encryptShopSecret(
    keySecret,
    `shop:${shop._id}:razorpay-key-secret`
  );
  shop.razorpayWebhookSecretEncrypted = encryptShopSecret(
    webhookSecret,
    `shop:${shop._id}:razorpay-webhook-secret`
  );
  await shop.save();
};

const seed = async () => {
  const shopA = await Shop.create({ shopName: "Shop A", ownerName: "Owner A", email: "shop-a@example.com" });
  const shopB = await Shop.create({ shopName: "Shop B", ownerName: "Owner B", email: "shop-b@example.com" });
  await configureShopPayments(shopA, {
    keyId: "rzp_test_shopA12345",
    keySecret: SHOP_A_KEY_SECRET,
    webhookSecret: SHOP_A_WEBHOOK_SECRET,
    upiId: "shopa@upi",
  });
  await configureShopPayments(shopB, {
    keyId: "rzp_test_shopB12345",
    keySecret: SHOP_B_KEY_SECRET,
    webhookSecret: SHOP_B_WEBHOOK_SECRET,
    upiId: "shopb@upi",
  });
  const customerA = await User.create({ fullName: "Customer A", email: "a@example.com", password: "secret12" });
  const customerB = await User.create({ fullName: "Customer B", email: "b@example.com", password: "secret12" });
  const ownerA = await User.create({ fullName: "Owner A", email: "oa@example.com", password: "secret12", role: "shopOwner", shopId: shopA._id });
  const ownerB = await User.create({ fullName: "Owner B", email: "ob@example.com", password: "secret12", role: "shopOwner", shopId: shopB._id });
  const staffA = await User.create({ fullName: "Staff A", email: "sa@example.com", password: "secret12", role: "staff", shopId: shopA._id });
  const staffB = await User.create({ fullName: "Staff B", email: "sb@example.com", password: "secret12", role: "staff", shopId: shopB._id });
  const admin = await User.create({ fullName: "Admin", email: "admin@example.com", password: "secret12", role: "admin" });
  await ShopSettings.create({ blackWhitePrice: 2, colorPrice: 10, a3Price: 15, gst: 0 });
  return { shopA, shopB, customerA, customerB, ownerA, ownerB, staffA, staffB, admin };
};

const createJob = (data) => PrintJob.create({
  shopId: data.shopId,
  user: data.user,
  assignedStaff: data.assignedStaff || null,
  fileName: data.fileName || "test.pdf",
  pages: 2,
  copies: 1,
  price: 4,
  ...data.extra,
});

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

test.afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("shop payment encryption is authenticated and bound to its shop context", () => {
  assert.equal(decodeEncryptionKey("22".repeat(32)).length, 32);
  assert.equal(decodeEncryptionKey(Buffer.alloc(32, 3).toString("base64")).length, 32);
  assert.throws(() => decodeEncryptionKey("not-a-valid-key"), /32-byte key/);
  const context = "shop:507f1f77bcf86cd799439011:razorpay-key-secret";
  const encrypted = encryptShopSecret("private-payment-secret", context);
  assert.equal(
    decryptShopSecret(encrypted, context),
    "private-payment-secret"
  );
  assert.throws(
    () => decryptShopSecret(
      encrypted,
      "shop:507f1f77bcf86cd799439012:razorpay-key-secret"
    ),
    /Unable to decrypt/
  );
});

test("customer cannot read another customer's order", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerB._id });
  const response = await request(app).get(`/api/print/${job._id}`).set(auth(tokenFor(users.customerA)));
  assert.equal(response.status, 403);
});

test("login token authenticates protected GET and multipart upload routes", async () => {
  const users = await seed();
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: users.customerA.email, password: "secret12" });

  assert.equal(login.status, 200);
  assert.equal(typeof login.body.token, "string");
  assert.equal(login.body.user.email, users.customerA.email);

  const decoded = jwt.verify(login.body.token, process.env.JWT_SECRET);
  assert.equal(decoded.id, users.customerA._id.toString());

  const protectedGet = await request(app)
    .get("/api/print")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(protectedGet.status, 200);

  const originalUploadStream = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = (_options, callback) => new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
    final(done) {
      callback(null, {
        public_id: "test/authenticated-upload",
        secure_url: "https://example.test/authenticated-upload.png",
      });
      done();
    },
  });
  try {
    for (let index = 0; index < 5; index += 1) {
      const multipart = await request(app)
        .post("/api/print")
        .set("Authorization", `Bearer ${login.body.token}`)
        .field("shopId", users.shopA._id.toString())
        .attach("file", Buffer.from(`test image content ${index}`), {
          filename: `authenticated-upload-${index}.png`,
          contentType: "image/png",
        });
      assert.equal(multipart.status, 201);
      assert.equal(multipart.body.success, true);
      assert.equal(multipart.body.job.user, users.customerA._id.toString());
      assert.equal(multipart.body.job.invoiceNumber, undefined);
    }
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
  }
});

test("authenticated PDF upload counts pages from the incoming buffer", async () => {
  const users = await seed();
  const fixtureName = fs.readdirSync(path.join(__dirname, "..", "uploads"))
    .find((name) => name.toLowerCase().endsWith(".pdf"));
  assert.ok(fixtureName, "A local PDF fixture is required");
  const fixture = fs.readFileSync(path.join(__dirname, "..", "uploads", fixtureName));
  const token = tokenFor(users.customerA);

  const originalUploadStream = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = (_options, callback) => new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
    final(done) {
      callback(null, {
        public_id: "test/authenticated-pdf-upload",
        secure_url: "https://example.test/private-pdf-url",
      });
      done();
    },
  });
  try {
    const response = await request(app)
      .post("/api/print")
      .set("Authorization", `Bearer ${token}`)
      .field("shopId", users.shopA._id.toString())
      .attach("file", fixture, {
        filename: "authenticated-upload.pdf",
        contentType: "application/pdf",
      });
    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.ok(response.body.job.pages > 0);
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
  }
});

test("shop owner cannot read another shop's order", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopB._id, user: users.customerB._id });
  const response = await request(app).get(`/api/print/${job._id}`).set(auth(tokenFor(users.ownerA)));
  assert.equal(response.status, 403);
});

test("staff cannot update an unassigned order", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id, assignedStaff: users.staffB._id });
  const response = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(tokenFor(users.staffA)))
    .send({ status: "Printing" });
  assert.equal(response.status, 403);
});

test("staff can only advance assigned orders through the sequential workflow", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    assignedStaff: users.staffA._id,
  });
  const token = tokenFor(users.staffA);

  const skipped = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(token))
    .send({ status: "Ready" });
  assert.equal(skipped.status, 400);

  for (const status of ["Printing", "Ready"]) {
    const response = await request(app)
      .put(`/api/print/${job._id}`)
      .set(auth(token))
      .send({ status });
    assert.equal(response.status, 200);
  }

  const unpaidCompletion = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(token))
    .send({ status: "Completed" });
  assert.equal(unpaidCompletion.status, 400);

  await PrintJob.findByIdAndUpdate(job._id, { paymentStatus: "Paid" });
  const completed = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(token))
    .send({ status: "Completed" });
  assert.equal(completed.status, 200);
});

test("shop owner cannot update or assign orders outside their shop", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopB._id, user: users.customerB._id });
  const response = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(tokenFor(users.ownerA)))
    .send({ assignedStaff: users.staffA._id });
  assert.equal(response.status, 403);
});

test("normal order updates reject payment fields for every role", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const response = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(tokenFor(users.admin)))
    .send({ paymentStatus: "Paid" });
  assert.equal(response.status, 400);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Pending");
});

test("customer cannot set payment status or complete an order", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const response = await request(app)
    .put(`/api/print/${job._id}`)
    .set(auth(tokenFor(users.customerA)))
    .send({
      copies: 1,
      printType: "Black & White",
      side: "Single Side",
      paperSize: "A4",
      paymentStatus: "Paid",
      status: "Completed",
    });
  assert.equal(response.status, 400);
  const unchanged = await PrintJob.findById(job._id);
  assert.equal(unchanged.paymentStatus, "Pending");
  assert.equal(unchanged.status, "Pending");
});

test("inactive staff token is rejected", async () => {
  const users = await seed();
  users.staffA.isAvailable = false;
  await users.staffA.save();
  const response = await request(app).get("/api/print").set(auth(tokenFor(users.staffA)));
  assert.equal(response.status, 403);
});

test("password and Razorpay signature are excluded from responses", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: {
      paymentMethod: "Razorpay",
      razorpayOrderId: "order_safe",
      razorpaySignature: "do-not-return",
    },
  });
  const orderResponse = await request(app).get(`/api/print/${job._id}`).set(auth(tokenFor(users.customerA)));
  assert.equal(orderResponse.status, 200);
  assert.equal(orderResponse.body.job.razorpaySignature, undefined);

  const staffResponse = await request(app).get("/api/users/staff").set(auth(tokenFor(users.admin)));
  assert.equal(staffResponse.status, 200);
  assert.ok(staffResponse.body.staff.every((user) => user.password === undefined));
});

test("shop owner can read and update only their own payment settings", async () => {
  const users = await seed();
  const ownerToken = tokenFor(users.ownerA);
  const encryptedBefore = (
    await Shop.findById(users.shopA._id).select("+razorpayKeySecretEncrypted")
  ).razorpayKeySecretEncrypted;

  const own = await request(app)
    .get(`/api/shops/${users.shopA._id}/payment-settings`)
    .set(auth(ownerToken));
  const other = await request(app)
    .get(`/api/shops/${users.shopB._id}/payment-settings`)
    .set(auth(ownerToken));
  const updated = await request(app)
    .put(`/api/shops/${users.shopA._id}/payment-settings`)
    .set(auth(ownerToken))
    .send({
      paymentMode: "both",
      paymentEnabled: true,
      upiId: "shopa-new@upi",
      razorpayKeyId: "rzp_test_shopA12345",
      paymentInstructions: "Use the order number in your payment note.",
      razorpayKeySecret: "",
    });

  assert.equal(own.status, 200);
  assert.equal(own.body.paymentSettings.hasRazorpaySecret, true);
  assert.equal(other.status, 403);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.paymentSettings.upiId, "shopa-new@upi");
  assert.equal(updated.body.paymentSettings.hasRazorpaySecret, true);
  const encryptedAfter = (
    await Shop.findById(users.shopA._id).select("+razorpayKeySecretEncrypted")
  ).razorpayKeySecretEncrypted;
  assert.equal(encryptedAfter, encryptedBefore);
});

test("customer and staff cannot access shop payment settings", async () => {
  const users = await seed();
  for (const actor of [users.customerA, users.staffA]) {
    const response = await request(app)
      .get(`/api/shops/${users.shopA._id}/payment-settings`)
      .set(auth(tokenFor(actor)));
    assert.equal(response.status, 403);
  }
});

test("payment settings responses never expose encrypted or plaintext secrets", async () => {
  const users = await seed();
  const response = await request(app)
    .get(`/api/shops/${users.shopA._id}/payment-settings`)
    .set(auth(tokenFor(users.admin)));
  const serialized = JSON.stringify(response.body);

  assert.equal(response.status, 200);
  assert.equal(serialized.includes(SHOP_A_KEY_SECRET), false);
  assert.equal(serialized.includes(SHOP_A_WEBHOOK_SECRET), false);
  assert.equal(serialized.includes("razorpayKeySecretEncrypted"), false);
  assert.equal(serialized.includes("razorpayWebhookSecretEncrypted"), false);
});

test("stored shop secrets are removed only with explicit clear flags", async () => {
  const users = await seed();
  const response = await request(app)
    .put(`/api/shops/${users.shopA._id}/payment-settings`)
    .set(auth(tokenFor(users.ownerA)))
    .send({
      paymentEnabled: true,
      paymentMode: "upi",
      upiId: "shopa@upi",
      razorpayKeyId: "",
      clearRazorpayKeySecret: true,
      clearRazorpayWebhookSecret: true,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.paymentSettings.hasRazorpaySecret, false);
  assert.equal(response.body.paymentSettings.hasWebhookSecret, false);
});

test("Razorpay order creation uses the print job shop credentials and notes", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopB._id,
    user: users.customerA._id,
  });
  const originalFactory = paymentService.createRazorpayClient;
  let receivedCredentials;
  let receivedOrder;
  paymentService.createRazorpayClient = (credentials) => {
    receivedCredentials = credentials;
    return {
      orders: {
        create: async (order) => {
          receivedOrder = order;
          return {
            id: "order_shop_b",
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: "created",
          };
        },
      },
    };
  };

  try {
    const response = await request(app)
      .post("/api/payment/create-order")
      .set(auth(tokenFor(users.customerA)))
      .send({
        printJobId: job._id,
        copies: 1,
        printType: "Black & White",
        side: "Single Side",
        paperSize: "A4",
      });
    assert.equal(response.status, 201);
    assert.equal(receivedCredentials.keyId, "rzp_test_shopB12345");
    assert.equal(receivedCredentials.keySecret, SHOP_B_KEY_SECRET);
    assert.equal(receivedOrder.notes.shopId, users.shopB._id.toString());
    assert.equal(receivedOrder.notes.printJobId, job._id.toString());
    assert.equal(response.body.keyId, "rzp_test_shopB12345");
    assert.equal(response.body.order.amount, 400);
  } finally {
    paymentService.createRazorpayClient = originalFactory;
  }
});

test("payment configuration exposes only the print job shop UPI details", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopB._id,
    user: users.customerA._id,
  });
  const response = await request(app)
    .get(`/api/payment/config/${job._id}`)
    .set(auth(tokenFor(users.customerA)));

  assert.equal(response.status, 200);
  assert.equal(response.body.shop.id, users.shopB._id.toString());
  assert.equal(response.body.payment.upiId, "shopb@upi");
  assert.equal(response.body.payment.upiAvailable, true);
  assert.equal(JSON.stringify(response.body).includes(SHOP_B_KEY_SECRET), false);
});

test("Shop A signature cannot verify a Shop B Razorpay order", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopB._id,
    user: users.customerA._id,
    extra: {
      paymentMethod: "Razorpay",
      razorpayOrderId: "order_cross_shop",
      razorpayAmount: 400,
    },
  });
  const paymentId = "pay_cross_shop";
  const wrongSignature = crypto
    .createHmac("sha256", SHOP_A_KEY_SECRET)
    .update(`order_cross_shop|${paymentId}`)
    .digest("hex");
  const response = await request(app)
    .post("/api/payment/verify")
    .set(auth(tokenFor(users.customerA)))
    .send({
      printJobId: job._id,
      razorpay_order_id: "order_cross_shop",
      razorpay_payment_id: paymentId,
      razorpay_signature: wrongSignature,
    });

  assert.equal(response.status, 400);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Pending");
});

test("valid Razorpay signature pays once and duplicate callback is idempotent", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentMethod: "Razorpay", razorpayOrderId: "order_valid" },
  });
  const paymentId = "pay_valid";
  const signature = crypto
    .createHmac("sha256", SHOP_A_KEY_SECRET)
    .update(`order_valid|${paymentId}`)
    .digest("hex");
  const payload = {
    printJobId: job._id.toString(),
    razorpay_order_id: "order_valid",
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  };

  const first = await request(app).post("/api/payment/verify").set(auth(tokenFor(users.customerA))).send(payload);
  const second = await request(app).post("/api/payment/verify").set(auth(tokenFor(users.customerA))).send(payload);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const paidJob = await PrintJob.findById(job._id);
  assert.equal(paidJob.paymentStatus, "Paid");
  assert.equal(paidJob.status, "Pending");
  assert.equal(paidJob.shopId.toString(), users.shopA._id.toString());
});

test("price quote returns the standardized price and breakdown shape", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const response = await request(app)
    .post("/api/payment/quote")
    .set(auth(tokenFor(users.customerA)))
    .send({
      printJobId: job._id.toString(),
      copies: 2,
      printType: "Black & White",
      side: "Double Side",
      paperSize: "A4",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.price, 4);
  assert.deepEqual(response.body.breakdown, {
    pages: 2,
    sheets: 1,
    copies: 2,
    rate: 2,
    subtotal: 4,
    gstPercent: 0,
    gstAmount: 0,
    total: 4,
    currency: "INR",
  });
  assert.equal(response.body.quote, undefined);
});

test("price quote uses safe defaults when shop settings are missing", async () => {
  const users = await seed();
  await ShopSettings.deleteMany({});
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const response = await request(app)
    .post("/api/payment/quote")
    .set(auth(tokenFor(users.customerA)))
    .send({
      printJobId: job._id.toString(),
      copies: 1,
      printType: "Black & White",
      side: "Single Side",
      paperSize: "A4",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.price, 4.72);
  assert.equal(response.body.breakdown.rate, 2);
  assert.equal(response.body.breakdown.gstPercent, 18);
});

test("invalid Razorpay signature is rejected", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentMethod: "Razorpay", razorpayOrderId: "order_invalid" },
  });
  const response = await request(app)
    .post("/api/payment/verify")
    .set(auth(tokenFor(users.customerA)))
    .send({
      printJobId: job._id.toString(),
      razorpay_order_id: "order_invalid",
      razorpay_payment_id: "pay_invalid",
      razorpay_signature: "invalid",
    });
  assert.equal(response.status, 400);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Pending");
});

test("UPI reference cannot be reused", async () => {
  const users = await seed();
  const firstJob = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const secondJob = await createJob({ shopId: users.shopA._id, user: users.customerA._id, fileName: "two.pdf" });
  const options = {
    upiReference: "UPI123456",
    copies: 1,
    printType: "Black & White",
    side: "Single Side",
    paperSize: "A4",
  };
  const first = await request(app).post("/api/payment/upi").set(auth(tokenFor(users.customerA))).send({ ...options, printJobId: firstJob._id });
  const second = await request(app).post("/api/payment/upi").set(auth(tokenFor(users.customerA))).send({ ...options, printJobId: secondJob._id });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
});

test("admin and the correct shop owner can review UPI payments", async () => {
  const users = await seed();
  const approveJob = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentMethod: "UPI", upiReference: "APPROVE1" },
  });
  const rejectJob = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    fileName: "reject.pdf",
    extra: { paymentMethod: "UPI", upiReference: "REJECT01" },
  });

  const denied = await request(app)
    .patch(`/api/payment/upi/${approveJob._id}/verify`)
    .set(auth(tokenFor(users.customerA)))
    .send({ decision: "approve" });
  const wrongOwner = await request(app)
    .patch(`/api/payment/upi/${approveJob._id}/verify`)
    .set(auth(tokenFor(users.ownerB)))
    .send({ decision: "approve" });
  const approved = await request(app)
    .patch(`/api/payment/upi/${approveJob._id}/verify`)
    .set(auth(tokenFor(users.ownerA)))
    .send({ decision: "approve" });
  const rejected = await request(app)
    .patch(`/api/payment/upi/${rejectJob._id}/verify`)
    .set(auth(tokenFor(users.admin)))
    .send({ decision: "reject" });

  assert.equal(denied.status, 403);
  assert.equal(wrongOwner.status, 403);
  assert.equal(approved.status, 200);
  assert.equal(rejected.status, 200);
  assert.equal((await PrintJob.findById(approveJob._id)).paymentStatus, "Paid");
  assert.equal((await PrintJob.findById(rejectJob._id)).paymentStatus, "Rejected");
});

test("verified Razorpay webhook reconciles only its matching order idempotently", async () => {
  const users = await seed();
  const matching = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentMethod: "Razorpay", razorpayOrderId: "order_webhook" },
  });
  const unrelated = await createJob({
    shopId: users.shopA._id,
    user: users.customerB._id,
    fileName: "unrelated.pdf",
    extra: { paymentMethod: "Razorpay", razorpayOrderId: "order_other" },
  });
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_webhook",
          order_id: "order_webhook",
          status: "captured",
          amount: 400,
          currency: "INR",
        },
      },
    },
  });
  const signature = crypto
    .createHmac("sha256", SHOP_A_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  const first = await request(app)
    .post(`/api/payment/webhook/${users.shopA._id}`)
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", signature)
    .send(body);
  const second = await request(app)
    .post(`/api/payment/webhook/${users.shopA._id}`)
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", signature)
    .send(body);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await PrintJob.findById(matching._id)).paymentStatus, "Paid");
  assert.equal((await PrintJob.findById(unrelated._id)).paymentStatus, "Pending");
});

test("webhook signed for Shop A cannot reconcile through Shop B", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentMethod: "Razorpay", razorpayOrderId: "order_wrong_shop" },
  });
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_wrong_shop",
          order_id: "order_wrong_shop",
          status: "captured",
          amount: 400,
          currency: "INR",
        },
      },
    },
  });
  const signature = crypto
    .createHmac("sha256", SHOP_A_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  const response = await request(app)
    .post(`/api/payment/webhook/${users.shopB._id}`)
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", signature)
    .send(body);

  assert.equal(response.status, 401);
  assert.equal((await PrintJob.findById(job._id)).paymentStatus, "Pending");
});

test("customer can view their own paid invoice", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentStatus: "Paid", paymentMethod: "UPI", upiReference: "OWNINV01" },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.customerA)));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.invoice.invoiceNumber, job.invoiceNumber);
  assert.equal(response.body.invoice.customer.email, users.customerA.email);
  assert.equal(response.body.invoice.amounts.total, 4);
});

test("customer cannot view another customer's invoice", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerB._id,
    extra: { paymentStatus: "Paid" },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.customerA)));
  assert.equal(response.status, 403);
});

test("shop owner cannot view another shop's invoice", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopB._id,
    user: users.customerB._id,
    extra: { paymentStatus: "Paid" },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.ownerA)));
  assert.equal(response.status, 403);
});

test("staff cannot view an unassigned invoice", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    assignedStaff: users.staffB._id,
    extra: { paymentStatus: "Paid" },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.staffA)));
  assert.equal(response.status, 403);
});

test("unpaid order invoice is rejected", async () => {
  const users = await seed();
  const job = await createJob({ shopId: users.shopA._id, user: users.customerA._id });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.customerA)));
  assert.equal(response.status, 409);
  assert.match(response.body.message, /payment is Pending/);
});

test("invoice JSON excludes Razorpay signature and other private fields", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: {
      paymentStatus: "Paid",
      paymentMethod: "Razorpay",
      razorpayPaymentId: "pay_invoice",
      razorpaySignature: "never-return-this",
    },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}`)
    .set(auth(tokenFor(users.customerA)));
  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.razorpaySignature, undefined);
  assert.equal(response.body.invoice.payment.razorpayPaymentId, "pay_invoice");
  assert.equal(JSON.stringify(response.body).includes("never-return-this"), false);
});

test("invoice PDF endpoint streams PDF with a safe invoice filename", async () => {
  const users = await seed();
  const job = await createJob({
    shopId: users.shopA._id,
    user: users.customerA._id,
    extra: { paymentStatus: "Paid", paymentMethod: "UPI", upiReference: "PDFINV01" },
  });
  const response = await request(app)
    .get(`/api/invoices/${job._id}/pdf`)
    .set(auth(tokenFor(users.customerA)))
    .buffer(true);

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^application\/pdf/);
  assert.equal(
    response.headers["content-disposition"],
    `attachment; filename="MSK-Invoice-${job.invoiceNumber}.pdf"`
  );
});
