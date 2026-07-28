const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Writable } = require("node:stream");

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "public-pricing-test-secret-at-least-32-characters";
process.env.SHOP_PAYMENT_ENCRYPTION_KEY = "44".repeat(32);
process.env.RAZORPAY_PLATFORM_FALLBACK_ENABLED = "false";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.PRINT_AGENT_MINUTES_PER_PAGE = "0.1";

const { createApp } = require("../app");
const cloudinary = require("../config/cloudinary");
const PrintJob = require("../models/printJob");
const Shop = require("../models/Shop");
const ShopSettings = require("../models/ShopSettings");
const User = require("../models/User");
const { calculatePrice } = require("../utils/pricing");

const app = createApp();
let mongo;

const tokenFor = (user) =>
  jwt.sign({ id: user._id, scope: "web" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const validPng = () => {
  const buffer = Buffer.alloc(26);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  Buffer.from("IHDR").copy(buffer, 12);
  buffer.writeUInt32BE(1, 16);
  buffer.writeUInt32BE(1, 20);
  return buffer;
};

const seedUsers = async () => {
  const shopA = await Shop.create({
    shopName: "Public Shop A",
    ownerName: "Owner A",
    email: "public-shop-a@example.com",
    shopCode: "PUBLIC-A",
  });
  const shopB = await Shop.create({
    shopName: "Public Shop B",
    ownerName: "Owner B",
    email: "public-shop-b@example.com",
    shopCode: "PUBLIC-B",
  });
  const admin = await User.create({
    fullName: "Admin",
    email: "public-admin@example.com",
    password: "secret12",
    role: "admin",
  });
  const ownerA = await User.create({
    fullName: "Owner A",
    email: "public-owner-a@example.com",
    password: "secret12",
    role: "shopOwner",
    shopId: shopA._id,
  });
  const customer = await User.create({
    fullName: "Customer",
    email: "public-customer@example.com",
    password: "secret12",
    role: "customer",
  });
  return { shopA, shopB, admin, ownerA, customer };
};

const withCloudinaryUpload = async (callback) => {
  const originalUpload = cloudinary.uploader.upload_stream;
  const originalDestroy = cloudinary.uploader.destroy;
  const publicIds = [];
  const destroyed = [];
  cloudinary.uploader.upload_stream = (options, completed) =>
    new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
      final(done) {
        const publicId = `${options.folder}/${options.public_id}`;
        publicIds.push(options.public_id);
        completed(null, {
          public_id: publicId,
          secure_url: `https://res.cloudinary.com/example/raw/authenticated/${publicId}`,
          type: options.type,
        });
        done();
      },
    });
  cloudinary.uploader.destroy = async (publicId) => {
    destroyed.push(publicId);
    return { result: "ok" };
  };

  try {
    return await callback({ publicIds, destroyed });
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
  }
};

const orderRequest = (
  shopCode,
  file = validPng(),
  filename = "document.png",
  guest = {
    customerName: "  Guest   Customer  ",
    mobileNumber: "+91 98765-43210",
    email: "GUEST@EXAMPLE.COM",
  }
) => {
  let pending = request(app)
    .post(`/api/public/shops/${shopCode}/orders`)
    .field("copies", "2")
    .field("printType", "Black & White")
    .field("side", "Single Side")
    .field("paperSize", "A4");
  for (const [field, value] of Object.entries(guest)) {
    pending = pending.field(field, value);
  }
  return pending.attach("file", file, { filename, contentType: "image/png" });
};

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    Shop.init(),
    ShopSettings.init(),
    PrintJob.init(),
    User.init(),
  ]);
});

test.afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("shop pricing is isolated with a legacy global fallback", async () => {
  const users = await seedUsers();

  const globalUpdate = await request(app)
    .put("/api/settings")
    .set(auth(users.admin))
    .send({ blackWhitePrice: 2, colorPrice: 10, a3Price: 15, gst: 0 });
  assert.equal(globalUpdate.status, 200);

  const inherited = await request(app)
    .get(`/api/settings/${users.shopA._id}`)
    .set(auth(users.ownerA));
  assert.equal(inherited.status, 200);
  assert.equal(inherited.body.settings.inherited, true);
  assert.equal(inherited.body.settings.blackWhitePrice, 2);

  const shopAUpdate = await request(app)
    .put(`/api/settings/${users.shopA._id}`)
    .set(auth(users.ownerA))
    .send({ blackWhitePrice: 3, gst: 0 });
  const shopBUpdate = await request(app)
    .put(`/api/settings/${users.shopB._id}`)
    .set(auth(users.admin))
    .send({ blackWhitePrice: 7, gst: 0 });
  assert.equal(shopAUpdate.status, 200);
  assert.equal(shopBUpdate.status, 200);

  const options = {
    copies: 1,
    printType: "Black & White",
    side: "Single Side",
    paperSize: "A4",
  };
  assert.equal((await calculatePrice(2, options, users.shopA._id)).price, 6);
  assert.equal((await calculatePrice(2, options, users.shopB._id)).price, 14);

  const quoteA = await request(app)
    .post(`/api/public/shops/${users.shopA.shopCode}/quote`)
    .send({ pages: 2, ...options });
  const quoteB = await request(app)
    .post(`/api/public/shops/${users.shopB.shopCode}/quote`)
    .send({ pages: 2, ...options });
  assert.equal(quoteA.body.quote.total, 6);
  assert.equal(quoteB.body.quote.total, 14);
});

test("shop settings enforce role and shop scope", async () => {
  const users = await seedUsers();
  const ownerCrossShop = await request(app)
    .get(`/api/settings/${users.shopB._id}`)
    .set(auth(users.ownerA));
  const customer = await request(app)
    .get(`/api/settings/${users.shopA._id}`)
    .set(auth(users.customer));
  const invalidId = await request(app)
    .get("/api/settings/not-an-id")
    .set(auth(users.admin));

  assert.equal(ownerCrossShop.status, 403);
  assert.equal(customer.status, 403);
  assert.equal(invalidId.status, 400);
});

test("concurrent first settings updates keep one scoped record", async () => {
  const users = await seedUsers();
  const responses = await Promise.all(
    [3, 4, 5, 6, 7].map((blackWhitePrice) =>
      request(app)
        .put(`/api/settings/${users.shopA._id}`)
        .set(auth(users.admin))
        .send({ blackWhitePrice, gst: 0 })
    )
  );
  assert.equal(responses.every((response) => response.status === 200), true);
  assert.equal(await ShopSettings.countDocuments({ shopId: users.shopA._id }), 1);
});

test("public upload validates content and stores sanitized guest details", async () => {
  const { shopA } = await seedUsers();
  await ShopSettings.create({ blackWhitePrice: 2, gst: 0 });

  await withCloudinaryUpload(async ({ publicIds }) => {
    const first = await orderRequest(shopA.shopCode);
    const second = await orderRequest(shopA.shopCode, validPng(), "second.png", {});
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.order.customer.name, "Guest Customer");
    assert.equal(second.body.order.customer.name, "Guest Customer");
    assert.equal(publicIds.length, 2);
    assert.notEqual(publicIds[0], publicIds[1]);

    const stored = await PrintJob.findById(first.body.order.id)
      .select("+cloudinaryPublicId +fileMimeType")
      .lean();
    assert.equal(stored.guestName, "Guest Customer");
    assert.equal(stored.guestMobile, "+919876543210");
    assert.equal(stored.guestEmail, "guest@example.com");
    assert.equal(stored.fileMimeType, "image/png");
    assert.match(stored.cloudinaryPublicId, /^msk-print\/[0-9a-f-]{36}$/i);
  });
});

test("public upload rejects missing, spoofed, and mismatched files before storage", async () => {
  const { shopA } = await seedUsers();
  let uploadCalls = 0;
  const originalUpload = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = () => {
    uploadCalls += 1;
    throw new Error("Storage should not be called");
  };

  try {
    const missing = await request(app)
      .post(`/api/public/shops/${shopA.shopCode}/orders`)
      .field("copies", "1")
      .field("printType", "Black & White")
      .field("side", "Single Side")
      .field("paperSize", "A4");
    const spoofed = await orderRequest(
      shopA.shopCode,
      Buffer.from("not a PNG file"),
      "spoofed.png"
    );
    const mismatched = await orderRequest(shopA.shopCode, validPng(), "wrong.pdf");
    const invalidContact = await orderRequest(
      shopA.shopCode,
      validPng(),
      "invalid-contact.png",
      { mobileNumber: "not-a-number" }
    );

    assert.equal(missing.status, 400);
    assert.equal(missing.body.stage, "file-validation");
    assert.equal(spoofed.status, 400);
    assert.match(spoofed.body.message, /file content/i);
    assert.equal(mismatched.status, 400);
    assert.match(mismatched.body.message, /extension/i);
    assert.equal(invalidContact.status, 400);
    assert.match(invalidContact.body.message, /mobile number/i);
    assert.equal(uploadCalls, 0);
    assert.equal(await PrintJob.countDocuments(), 0);
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
  }
});

test("uploaded Cloudinary asset is removed when database creation fails", async () => {
  const { shopA } = await seedUsers();
  const originalCreate = PrintJob.create;

  await withCloudinaryUpload(async ({ destroyed }) => {
    PrintJob.create = async () => {
      throw new Error("simulated database failure");
    };
    try {
      const response = await orderRequest(shopA.shopCode);
      assert.equal(response.status, 500);
      assert.equal(response.body.message.includes("simulated database failure"), false);
      assert.equal(destroyed.length, 1);
      assert.match(destroyed[0], /^msk-print\/[0-9a-f-]{36}$/i);
    } finally {
      PrintJob.create = originalCreate;
    }
  });
});

test("public tracking is token-protected and includes queue estimates without private fields", async () => {
  const { shopA, shopB } = await seedUsers();
  const createGuestJob = async ({ token, pages, copies, errorReason = "" }) =>
    PrintJob.create({
      shopId: shopA._id,
      user: null,
      isGuestOrder: true,
      guestName: "Queue Guest",
      publicOrderTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      publicOrderExpiresAt: new Date(Date.now() + 60_000),
      fileName: `${token.slice(0, 8)}.pdf`,
      pages,
      copies,
      price: 20,
      paymentMethod: "Cash",
      paymentStatus: "Paid",
      status: "Pending",
      errorReason,
      cloudinaryPublicId: `private/${token}`,
      filePath: "C:\\private\\print-file.pdf",
    });

  await createGuestJob({ token: "a".repeat(64), pages: 10, copies: 2 });
  await PrintJob.create({
    shopId: shopB._id,
    user: null,
    isGuestOrder: true,
    publicOrderTokenHash: crypto
      .createHash("sha256")
      .update("d".repeat(64))
      .digest("hex"),
    publicOrderExpiresAt: new Date(Date.now() + 60_000),
    fileName: "other-shop.pdf",
    pages: 100,
    copies: 10,
    price: 100,
    paymentMethod: "Cash",
    paymentStatus: "Paid",
    status: "Pending",
  });
  const tracked = await createGuestJob({ token: "b".repeat(64), pages: 1, copies: 1 });

  const response = await request(app)
    .get(`/api/public/orders/${"b".repeat(64)}`)
    .query({ shopCode: shopA.shopCode });
  const invalid = await request(app)
    .get(`/api/public/orders/${"c".repeat(64)}`)
    .query({ shopCode: shopA.shopCode });

  assert.equal(response.status, 200);
  assert.equal(response.body.order._id, tracked._id.toString());
  assert.equal(response.body.order.queuePosition, 2);
  assert.equal(response.body.order.estimatedWaitMinutes, 2);
  assert.equal(typeof response.body.order.updatedAt, "string");
  assert.equal(response.body.order.customer.name, "Queue Guest");
  assert.equal(JSON.stringify(response.body).includes("cloudinaryPublicId"), false);
  assert.equal(JSON.stringify(response.body).includes("C:\\private"), false);
  assert.equal(JSON.stringify(response.body).includes("publicOrderTokenHash"), false);
  assert.equal(invalid.status, 404);

  const debug = await request(app).get("/api/public/debug/shops");
  assert.equal(debug.status, 404);
});
