"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  SettingsStore,
  SecureSessionStore,
} = require("../src/lib/settingsStore");

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
  decryptString: (value) =>
    Buffer.from(value).toString("utf8").replace(/^protected:/, ""),
};

test("secure session encrypts JWT and preserves recovery state on authentication clear", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "msk-agent-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "session.json");
  const store = new SecureSessionStore(filePath, fakeSafeStorage);
  const jobId = "64b000000000000000000001";
  const claimToken = "a".repeat(43);

  await store.setSession({
    token: "header.payload.signature-value",
    user: {
      id: "64b000000000000000000010",
      fullName: "Owner",
      email: "owner@example.com",
      role: "shopOwner",
      password: "must-not-be-saved",
    },
    shop: { id: "64b000000000000000000020", shopName: "Central", shopCode: "MSK" },
  });
  await store.saveClaim(jobId, claimToken);
  await store.enqueueOutbox({
    jobId,
    action: "complete",
    payload: { printerName: "Office Printer" },
  });

  const raw = await fs.readFile(filePath, "utf8");
  assert.equal(raw.includes("header.payload"), false);
  assert.equal(raw.includes("must-not-be-saved"), false);
  assert.equal(raw.includes(claimToken), false);

  await store.clearAuthentication();
  const recovered = await store.getSession();
  assert.equal(recovered.token, null);
  assert.equal(recovered.user, null);
  assert.equal(recovered.shop, null);
  assert.equal(recovered.claims[jobId], claimToken);
  assert.equal(recovered.outbox.length, 1);
});

test("public settings reject token and password fields", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "msk-agent-settings-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "settings.json");
  const store = new SettingsStore(filePath);

  const result = await store.update({
    selectedPrinter: "Printer One",
    paused: true,
    token: "unsafe-token",
    password: "unsafe-password",
  });
  assert.equal(result.selectedPrinter, "Printer One");
  assert.equal(result.paused, true);

  const raw = await fs.readFile(filePath, "utf8");
  assert.equal(raw.includes("unsafe-token"), false);
  assert.equal(raw.includes("unsafe-password"), false);
});
