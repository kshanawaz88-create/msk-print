"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ApiClient, ApiError, validateBaseUrl } = require("../src/lib/apiClient");

test("API client attaches agent JWT to protected queue calls but not login", async () => {
  const requests = [];
  const client = new ApiClient({
    baseUrl: "http://localhost:5000",
    getToken: async () => "agent.jwt.value",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.login({ shopId: "SHOP", email: "owner@example.com", password: "secret1" });
  await client.getQueue();

  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.Authorization, "Bearer agent.jwt.value");
  assert.match(requests[1].url, /\/api\/print\/queue$/);
});

test("secure file download sends claim header and accepts only supported print bytes", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "msk-agent-api-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, "order.pdf");
  const client = new ApiClient({
    getToken: async () => "agent.jwt.value",
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer agent.jwt.value");
      assert.equal(options.headers["X-Print-Claim"], "c".repeat(43));
      return new Response(Buffer.from("%PDF-1.7\nsafe"), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="invoice.pdf"',
        },
      });
    },
  });

  const result = await client.downloadFile(
    "64b000000000000000000001",
    "c".repeat(43),
    destination
  );
  assert.equal(result.contentType, "application/pdf");
  assert.equal(result.filename, "invoice.pdf");
  assert.match(await fs.readFile(destination, "utf8"), /^%PDF-/);
});

test("API URL rejects cleartext non-loopback servers and 401 clears authentication", async () => {
  assert.throws(() => validateBaseUrl("http://example.com"), /HTTPS/);
  let unauthorized = 0;
  const client = new ApiClient({
    getToken: async () => "expired.jwt.value",
    onUnauthorized: async () => {
      unauthorized += 1;
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Agent token expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  });

  await assert.rejects(
    client.getQueue(),
    (error) => error instanceof ApiError && error.status === 401
  );
  assert.equal(unauthorized, 1);
});
