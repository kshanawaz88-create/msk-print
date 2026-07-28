const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "print-agent-test-secret-at-least-32-characters";
process.env.SHOP_PAYMENT_ENCRYPTION_KEY = "44".repeat(32);
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.PRINT_AGENT_TOKEN_TTL = "1h";

const { createApp } = require("../app");
const Shop = require("../models/Shop");
const User = require("../models/User");
const PrintJob = require("../models/printJob");
const printFileService = require("../services/printFileService");

const app = createApp();
let mongo;

const SHOP_OWNER_PASSWORD = "owner-secret-12";
const ADMIN_PASSWORD = "admin-secret-12";
const claimToken = (character) => character.repeat(43);
const agentAuth = (token) => ({ Authorization: `Bearer ${token}` });

const createActors = async () => {
  const [shopA, shopB] = await Shop.create([
    {
      shopName: "Agent Shop A",
      ownerName: "Owner A",
      email: "agent-shop-a@example.com",
      shopCode: "AGENT-A",
    },
    {
      shopName: "Agent Shop B",
      ownerName: "Owner B",
      email: "agent-shop-b@example.com",
      shopCode: "AGENT-B",
    },
  ]);
  const [ownerA, ownerB, admin, staff, customerA, customerB] = await User.create([
    {
      fullName: "Owner A",
      email: "agent-owner-a@example.com",
      password: SHOP_OWNER_PASSWORD,
      role: "shopOwner",
      shopId: shopA._id,
    },
    {
      fullName: "Owner B",
      email: "agent-owner-b@example.com",
      password: SHOP_OWNER_PASSWORD,
      role: "shopOwner",
      shopId: shopB._id,
    },
    {
      fullName: "Agent Admin",
      email: "agent-admin@example.com",
      password: ADMIN_PASSWORD,
      role: "admin",
    },
    {
      fullName: "Agent Staff",
      email: "agent-staff@example.com",
      password: "staff-secret-12",
      role: "staff",
      shopId: shopA._id,
    },
    {
      fullName: "Customer A",
      email: "agent-customer-a@example.com",
      password: "customer-secret-12",
      role: "customer",
    },
    {
      fullName: "Customer B",
      email: "agent-customer-b@example.com",
      password: "customer-secret-12",
      role: "customer",
    },
  ]);
  return {
    shopA,
    shopB,
    ownerA,
    ownerB,
    admin,
    staff,
    customerA,
    customerB,
  };
};

const loginAgent = async ({ shopId, email, password }) =>
  request(app)
    .post("/api/agent/login")
    .send({ shopId, email, password });

const loginWeb = async (email, password) =>
  request(app)
    .post("/api/auth/login")
    .send({ email, password });

const loginOwner = async (actors, shop = actors.shopA) => {
  const response = await loginAgent({
    shopId: shop.shopCode,
    email: actors.ownerA.email,
    password: SHOP_OWNER_PASSWORD,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.token;
};

const createJob = async ({
  shopId,
  user,
  fileName = "agent-test.pdf",
  paymentStatus = "Paid",
  status = "Pending",
  createdAt,
  extra = {},
}) => {
  const job = await PrintJob.create({
    shopId,
    user,
    fileName,
    filePath: "C:\\private\\never-return.pdf",
    fileUrl: "https://res.cloudinary.com/private/never-return",
    cloudinaryPublicId: `agent-tests/${crypto.randomUUID()}`,
    cloudinaryDeliveryType: "authenticated",
    fileMimeType: "application/pdf",
    fileSize: 1024,
    pages: 3,
    copies: 2,
    paperSize: "A4",
    printType: "Black & White",
    side: "Double Side",
    price: 12,
    paymentStatus,
    paymentMethod: paymentStatus === "Paid" ? "Razorpay" : "",
    razorpaySignature: "must-never-leave-the-server",
    status,
    ...extra,
  });
  if (createdAt) {
    await PrintJob.updateOne(
      { _id: job._id },
      { $set: { createdAt: new Date(createdAt), updatedAt: new Date(createdAt) } }
    );
    job.createdAt = new Date(createdAt);
  }
  return job;
};

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
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

test("admin and the matching shop owner can create scoped print-agent sessions", async () => {
  const actors = await createActors();

  const ownerLogin = await loginAgent({
    shopId: actors.shopA.shopCode,
    email: actors.ownerA.email,
    password: SHOP_OWNER_PASSWORD,
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal(ownerLogin.body.success, true);
  assert.equal(ownerLogin.body.user.role, "shopOwner");
  assert.equal(ownerLogin.body.user.password, undefined);
  assert.equal(ownerLogin.body.shop.id, actors.shopA._id.toString());

  const ownerPayload = jwt.verify(
    ownerLogin.body.token,
    process.env.JWT_SECRET,
    {
      audience: "msk-print-agent",
      issuer: "msk-print-cloud",
    }
  );
  assert.equal(ownerPayload.id, actors.ownerA._id.toString());
  assert.equal(ownerPayload.shopId, actors.shopA._id.toString());
  assert.equal(ownerPayload.scope, "print-agent");
  assert.equal(typeof ownerPayload.jti, "string");

  const adminLogin = await loginAgent({
    shopId: actors.shopB._id.toString(),
    email: actors.admin.email,
    password: ADMIN_PASSWORD,
  });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.user.role, "admin");
  assert.equal(adminLogin.body.shop.id, actors.shopB._id.toString());
});

test("web login exchanges for an owner shop and requires admin shop selection", async () => {
  const actors = await createActors();

  const ownerLogin = await loginWeb(actors.ownerA.email, SHOP_OWNER_PASSWORD);
  assert.equal(ownerLogin.status, 200, JSON.stringify(ownerLogin.body));
  assert.equal(ownerLogin.body.success, true);
  assert.equal(typeof ownerLogin.body.token, "string");
  assert.equal(ownerLogin.body.user.role, "shopOwner");
  assert.equal(ownerLogin.body.user.password, undefined);
  assert.equal(
    jwt.verify(ownerLogin.body.token, process.env.JWT_SECRET).scope,
    "web"
  );

  const ownerSession = await request(app)
    .post("/api/agent/session")
    .set(agentAuth(ownerLogin.body.token))
    .send({});
  assert.equal(ownerSession.status, 200, JSON.stringify(ownerSession.body));
  assert.equal(ownerSession.body.shop.id, actors.shopA._id.toString());
  assert.equal(
    jwt.verify(ownerSession.body.token, process.env.JWT_SECRET, {
      audience: "msk-print-agent",
      issuer: "msk-print-cloud",
    }).scope,
    "print-agent"
  );

  const adminLogin = await loginWeb(actors.admin.email, ADMIN_PASSWORD);
  assert.equal(adminLogin.status, 200);
  const selectionRequired = await request(app)
    .post("/api/agent/session")
    .set(agentAuth(adminLogin.body.token))
    .send({});
  assert.equal(selectionRequired.status, 409);
  assert.equal(selectionRequired.body.code, "SHOP_SELECTION_REQUIRED");
  assert.equal(selectionRequired.body.shops.length, 2);
  assert.equal(JSON.stringify(selectionRequired.body).includes("password"), false);

  const selected = await request(app)
    .post("/api/agent/session")
    .set(agentAuth(adminLogin.body.token))
    .send({ shopId: actors.shopB._id.toString() });
  assert.equal(selected.status, 200, JSON.stringify(selected.body));
  assert.equal(selected.body.shop.id, actors.shopB._id.toString());

  const customerLogin = await loginWeb(
    actors.customerA.email,
    "customer-secret-12"
  );
  const customerSession = await request(app)
    .post("/api/agent/session")
    .set(agentAuth(customerLogin.body.token))
    .send({});
  assert.equal(customerSession.status, 403);
  assert.match(customerSession.body.message, /administrators.*shop owners/i);
});

test("staff and customers cannot log in, and owners cannot select another shop", async () => {
  const actors = await createActors();

  const staffLogin = await loginAgent({
    shopId: actors.shopA.shopCode,
    email: actors.staff.email,
    password: "staff-secret-12",
  });
  const customerLogin = await loginAgent({
    shopId: actors.shopA.shopCode,
    email: actors.customerA.email,
    password: "customer-secret-12",
  });
  const crossShopOwner = await loginAgent({
    shopId: actors.shopB.shopCode,
    email: actors.ownerA.email,
    password: SHOP_OWNER_PASSWORD,
  });

  assert.equal(staffLogin.status, 401);
  assert.equal(customerLogin.status, 401);
  assert.equal(crossShopOwner.status, 403);

  const ordinaryWebToken = jwt.sign(
    { id: actors.ownerA._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const queueWithWebToken = await request(app)
    .get("/api/print/queue")
    .set(agentAuth(ordinaryWebToken));
  assert.equal(queueWithWebToken.status, 401);
});

test("queue is paid-only, shop-scoped, FIFO, and returns a redacted DTO", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const oldest = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
    fileName: "oldest-paid.pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const printing = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerB._id,
    fileName: "printing-paid.pdf",
    status: "Printing",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
    fileName: "unpaid.pdf",
    paymentStatus: "Pending",
    createdAt: "2025-12-01T00:00:00.000Z",
  });
  await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
    fileName: "ready.pdf",
    status: "Ready",
  });
  await createJob({
    shopId: actors.shopB._id,
    user: actors.customerB._id,
    fileName: "other-shop.pdf",
    createdAt: "2025-11-01T00:00:00.000Z",
  });

  const response = await request(app)
    .get("/api/print/queue")
    .set(agentAuth(token));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(
    response.body.queue.map((job) => job.id),
    [oldest._id.toString(), printing._id.toString()]
  );
  assert.deepEqual(response.body.counts, {
    waiting: 1,
    printing: 1,
    completed: 0,
    errors: 0,
  });
  assert.equal(response.body.queue[0].customer, actors.customerA.fullName);
  assert.equal(response.body.queue[0].claimable, true);
  assert.equal(response.body.queue[1].claimable, false);

  const serialized = JSON.stringify(response.body);
  for (const privateValue of [
    "filePath",
    "fileUrl",
    "cloudinaryPublicId",
    "cloudinaryDeliveryType",
    "fileMimeType",
    "razorpaySignature",
    "must-never-leave-the-server",
    actors.customerA.email,
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
});

test("concurrent claims are atomic and a retry with the winning token is idempotent", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const job = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const tokens = [claimToken("a"), claimToken("b")];

  const responses = await Promise.all(
    tokens.map((printClaim) =>
      request(app)
        .post("/api/print/queue/claim")
        .set(agentAuth(token))
        .set("X-Print-Claim", printClaim)
        .send({ printJobId: job._id.toString() })
    )
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409]
  );

  const winnerIndex = responses.findIndex((response) => response.status === 200);
  const winningToken = tokens[winnerIndex];
  const retry = await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(token))
    .set("X-Print-Claim", winningToken)
    .send({ printJobId: job._id.toString() });
  assert.equal(retry.status, 200);
  assert.match(retry.body.message, /already claimed/i);

  const stored = await PrintJob.findById(job._id).select(
    "+printClaimHash +printAttemptCount"
  );
  assert.equal(
    stored.printClaimHash,
    crypto.createHash("sha256").update(winningToken).digest("hex")
  );
  assert.equal(stored.printAttemptCount, 1);
});

test("only stale Pending claims are recoverable and Printing claims never expire", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const stale = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const active = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const printing = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
    status: "Printing",
  });
  const oldHash = crypto.createHash("sha256").update(claimToken("j")).digest("hex");
  const now = Date.now();
  await PrintJob.updateOne({ _id: stale._id }, {
    $set: {
      printClaimHash: oldHash,
      printAgentSessionId: "crashed-session",
      printClaimedAt: new Date(now - 120_000),
      printClaimExpiresAt: new Date(now - 60_000),
      printAttemptCount: 1,
    },
  });
  await PrintJob.updateMany({ _id: { $in: [active._id, printing._id] } }, {
    $set: {
      printClaimHash: oldHash,
      printAgentSessionId: "active-session",
      printClaimedAt: new Date(now),
      printClaimExpiresAt: new Date(now + 60_000),
      printAttemptCount: 1,
    },
  });

  const recoveredToken = claimToken("k");
  const recovered = await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(token))
    .set("X-Print-Claim", recoveredToken)
    .send({ printJobId: stale._id.toString() });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.job.printAttemptCount, 2);

  await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(token))
    .set("X-Print-Claim", claimToken("l"))
    .send({ printJobId: active._id.toString() })
    .expect(409);
  await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(token))
    .set("X-Print-Claim", claimToken("m"))
    .send({ printJobId: printing._id.toString() })
    .expect(409);

  const stored = await PrintJob.findById(stale._id).select(
    "+printClaimHash +printAttemptCount +printClaimExpiresAt"
  );
  assert.equal(stored.printAttemptCount, 2);
  assert.equal(
    stored.printClaimHash,
    crypto.createHash("sha256").update(recoveredToken).digest("hex")
  );
  assert.ok(stored.printClaimExpiresAt > new Date());
});

test("start and complete callbacks are idempotent for the same claim", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const job = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const printClaim = claimToken("c");
  const headers = {
    ...agentAuth(token),
    "X-Print-Claim": printClaim,
  };

  const claimed = await request(app)
    .post("/api/print/queue/claim")
    .set(headers)
    .send({ printJobId: job._id.toString() });
  assert.equal(claimed.status, 200);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = await request(app)
      .post(`/api/print/queue/${job._id}/started`)
      .set(headers)
      .send({});
    assert.equal(started.status, 200);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completed = await request(app)
      .post(`/api/print/queue/${job._id}/complete`)
      .set(headers)
      .send({ printerName: "Microsoft Print to PDF" });
    assert.equal(completed.status, 200);
  }

  const stored = await PrintJob.findById(job._id);
  assert.equal(stored.status, "Completed");
  assert.equal(stored.printerName, "Microsoft Print to PDF");
  assert.ok(stored.printStartedAt instanceof Date);
  assert.ok(stored.printCompletedAt instanceof Date);
});

test("file download requires both the scoped agent JWT and matching print claim", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const otherShopToken = await loginAgent({
    shopId: actors.shopB.shopCode,
    email: actors.ownerB.email,
    password: SHOP_OWNER_PASSWORD,
  });
  assert.equal(otherShopToken.status, 200);
  const job = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const printClaim = claimToken("d");
  await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(token))
    .set("X-Print-Claim", printClaim)
    .send({ printJobId: job._id.toString() })
    .expect(200);

  const originalStream = printFileService.streamPrintFile;
  let streamedJob;
  printFileService.streamPrintFile = async (selectedJob, res) => {
    streamedJob = selectedJob;
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="agent-test.pdf"',
    });
    res.send(Buffer.from("%PDF-agent-test"));
  };

  try {
    const withoutClaim = await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(token));
    const wrongClaim = await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(token))
      .set("X-Print-Claim", claimToken("e"));
    const otherShop = await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(otherShopToken.body.token))
      .set("X-Print-Claim", printClaim);
    const authorized = await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(token))
      .set("X-Print-Claim", printClaim);

    assert.equal(withoutClaim.status, 400);
    assert.equal(wrongClaim.status, 403);
    assert.equal(otherShop.status, 403);
    assert.equal(authorized.status, 200);
    assert.match(authorized.headers["content-type"], /^application\/pdf/);
    assert.equal(authorized.body.toString(), "%PDF-agent-test");
    assert.equal(
      streamedJob.cloudinaryPublicId,
      job.cloudinaryPublicId
    );
  } finally {
    printFileService.streamPrintFile = originalStream;
  }
});

test("claim operations are bound to the current scoped agent session", async () => {
  const actors = await createActors();
  const firstToken = await loginOwner(actors);
  const secondLogin = await loginAgent({
    shopId: actors.shopA.shopCode,
    email: actors.ownerA.email,
    password: SHOP_OWNER_PASSWORD,
  });
  assert.equal(secondLogin.status, 200);
  const secondToken = secondLogin.body.token;
  const job = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const printClaim = claimToken("i");

  await request(app)
    .post("/api/print/queue/claim")
    .set(agentAuth(firstToken))
    .set("X-Print-Claim", printClaim)
    .send({ printJobId: job._id.toString() })
    .expect(200);

  const originalStream = printFileService.streamPrintFile;
  printFileService.streamPrintFile = async (_selectedJob, res) => {
    res.type("application/pdf").send(Buffer.from("%PDF-session-test"));
  };
  try {
    await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(secondToken))
      .set("X-Print-Claim", printClaim)
      .expect(403);

    await request(app)
      .post("/api/print/queue/claim")
      .set(agentAuth(secondToken))
      .set("X-Print-Claim", printClaim)
      .send({ printJobId: job._id.toString() })
      .expect(200);

    await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(firstToken))
      .set("X-Print-Claim", printClaim)
      .expect(403);
    await request(app)
      .get(`/api/print/queue/${job._id}/file`)
      .set(agentAuth(secondToken))
      .set("X-Print-Claim", printClaim)
      .expect(200);
  } finally {
    printFileService.streamPrintFile = originalStream;
  }
});

test("print failures are recorded and only scoped paid terminal orders can be reprinted", async () => {
  const actors = await createActors();
  const token = await loginOwner(actors);
  const otherShopToken = await loginAgent({
    shopId: actors.shopB.shopCode,
    email: actors.ownerB.email,
    password: SHOP_OWNER_PASSWORD,
  });
  const job = await createJob({
    shopId: actors.shopA._id,
    user: actors.customerA._id,
  });
  const firstClaim = claimToken("f");
  const firstHeaders = {
    ...agentAuth(token),
    "X-Print-Claim": firstClaim,
  };

  await request(app)
    .post("/api/print/queue/claim")
    .set(firstHeaders)
    .send({ printJobId: job._id.toString() })
    .expect(200);
  await request(app)
    .post(`/api/print/queue/${job._id}/started`)
    .set(firstHeaders)
    .send({})
    .expect(200);
  const failed = await request(app)
    .post(`/api/print/queue/${job._id}/error`)
    .set(firstHeaders)
    .send({ errorReason: "Printer offline\r\nPaper out" });
  assert.equal(failed.status, 200);

  let stored = await PrintJob.findById(job._id).select("+printAttemptCount");
  assert.equal(stored.status, "Error");
  assert.equal(stored.errorReason, "Printer offline Paper out");
  assert.equal(stored.printAttemptCount, 1);

  const otherShopReprint = await request(app)
    .post(`/api/print/queue/${job._id}/reprint`)
    .set(agentAuth(otherShopToken.body.token))
    .set("X-Print-Claim", claimToken("g"))
    .send({});
  assert.equal(otherShopReprint.status, 409);

  const secondClaim = claimToken("h");
  const reprint = await request(app)
    .post(`/api/print/queue/${job._id}/reprint`)
    .set(agentAuth(token))
    .set("X-Print-Claim", secondClaim)
    .send({});
  assert.equal(reprint.status, 200);
  assert.equal(reprint.body.job.status, "Pending");
  assert.equal(reprint.body.job.claimedByThisAgent, true);

  stored = await PrintJob.findById(job._id).select("+printClaimHash +printAttemptCount");
  assert.equal(stored.status, "Pending");
  assert.equal(stored.errorReason, "");
  assert.equal(stored.printAttemptCount, 2);
  assert.equal(
    stored.printClaimHash,
    crypto.createHash("sha256").update(secondClaim).digest("hex")
  );

  const oldClaimCannotComplete = await request(app)
    .post(`/api/print/queue/${job._id}/complete`)
    .set(firstHeaders)
    .send({ printerName: "Wrong retry" });
  assert.equal(oldClaimCannotComplete.status, 409);
});
