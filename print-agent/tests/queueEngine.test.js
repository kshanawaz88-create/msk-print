"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ApiError } = require("../src/lib/apiClient");
const { QueueEngine } = require("../src/lib/queueEngine");

const IDS = [
  "64b000000000000000000001",
  "64b000000000000000000002",
  "64b000000000000000000003",
];

const order = (id, createdAt) => ({
  id,
  status: "Pending",
  paymentStatus: "Paid",
  claimable: true,
  customer: "Customer",
  fileName: `${id}.pdf`,
  pages: 2,
  copies: 1,
  paperSize: "A4",
  printType: "Black & White",
  side: "Single",
  createdAt,
});

class MemorySettings {
  constructor() {
    this.value = {
      selectedPrinter: "Office Printer",
      paused: false,
      mappings: {},
      printDefaults: {},
      journal: null,
    };
  }
  async get() {
    return structuredClone(this.value);
  }
  async update(patch) {
    this.value = { ...this.value, ...structuredClone(patch) };
    return this.get();
  }
  async clearJournal() {
    this.value.journal = null;
  }
}

class MemorySession {
  constructor() {
    this.claims = {};
    this.outbox = [];
  }
  async saveClaim(id, token) {
    this.claims[id] = token;
  }
  async getClaim(id) {
    return this.claims[id] || null;
  }
  async deleteClaim(id) {
    delete this.claims[id];
  }
  async enqueueOutbox(entry) {
    const index = this.outbox.findIndex(
      (item) => item.jobId === entry.jobId && item.action === entry.action
    );
    if (index >= 0) this.outbox[index] = structuredClone(entry);
    else this.outbox.push(structuredClone(entry));
  }
  async listOutbox() {
    return structuredClone(this.outbox);
  }
  async removeOutbox(jobId, action) {
    this.outbox = this.outbox.filter(
      (entry) => entry.jobId !== jobId || entry.action !== action
    );
  }
}

class FakeApi {
  constructor(orders) {
    this.orders = orders;
    this.claims = [];
    this.started = [];
    this.completed = [];
    this.errors = [];
    this.completeFailures = 0;
  }
  async getQueue() {
    return { queue: structuredClone(this.orders), counts: {} };
  }
  async getHistory() {
    return { history: [] };
  }
  async claim(id, token) {
    this.claims.push(id);
    const found = this.orders.find((entry) => entry.id === id);
    if (!found) throw new ApiError("Not claimable", { status: 409 });
    found.claimable = false;
    found.claimedByThisAgent = true;
    return { job: structuredClone(found), tokenSeen: Boolean(token) };
  }
  async downloadFile(id, token, destination) {
    assert.ok(token);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, `%PDF fake ${id}`);
    return { path: destination };
  }
  async markStarted(id) {
    this.started.push(id);
    const found = this.orders.find((entry) => entry.id === id);
    found.status = "Printing";
    return { success: true };
  }
  async markComplete(id) {
    this.completed.push(id);
    if (this.completeFailures > 0) {
      this.completeFailures -= 1;
      throw new ApiError("Network lost", { status: 0, code: "NETWORK_ERROR" });
    }
    this.orders = this.orders.filter((entry) => entry.id !== id);
    return { success: true };
  }
  async markError(id, token, reason) {
    this.errors.push({ id, reason });
    this.orders = this.orders.filter((entry) => entry.id !== id);
    return { success: true };
  }
  async cancel(id) {
    this.orders = this.orders.filter((entry) => entry.id !== id);
    return { success: true };
  }
}

class FakePrinter {
  constructor() {
    this.prints = [];
    this.ready = true;
    this.release = null;
  }
  resolvePrinter() {
    return "Office Printer";
  }
  async isPrinterReady() {
    return {
      ready: this.ready,
      status: this.ready ? "Ready" : "Offline",
      printer: { paperOut: false },
    };
  }
  async printJob(filePath, job) {
    this.prints.push(job.id);
    if (this.release) await this.release;
    return { success: true, printerName: "Office Printer" };
  }
  async cancelCurrent() {
    return { cancelled: false, reason: "NO_ACTIVE_PRINT" };
  }
}

const createEngine = async (orders) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "msk-agent-queue-"));
  const api = new FakeApi(orders);
  const printer = new FakePrinter();
  const settings = new MemorySettings();
  const session = new MemorySession();
  let tokenIndex = 0;
  const engine = new QueueEngine({
    api,
    printerService: printer,
    settingsStore: settings,
    sessionStore: session,
    tempDirectory: directory,
    randomToken: () => `${String(++tokenIndex).padStart(32, "a")}`,
  });
  return { directory, engine, api, printer, settings, session };
};

test("queue uses FIFO and processes simultaneous orders one at a time", async (t) => {
  const fixture = await createEngine([
    order(IDS[1], "2026-07-18T10:01:00.000Z"),
    order(IDS[0], "2026-07-18T10:00:00.000Z"),
  ]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));

  await fixture.engine.tick();
  await fixture.engine.waitForIdle();
  assert.deepEqual(fixture.api.claims, [IDS[0]]);
  assert.deepEqual(fixture.printer.prints, [IDS[0]]);

  await fixture.engine.tick();
  await fixture.engine.waitForIdle();
  assert.deepEqual(fixture.api.claims, [IDS[0], IDS[1]]);
  assert.deepEqual(fixture.printer.prints, [IDS[0], IDS[1]]);
});

test("overlapping poll calls do not claim or print the same order twice", async (t) => {
  const fixture = await createEngine([
    order(IDS[0], "2026-07-18T10:00:00.000Z"),
  ]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));

  await Promise.all([
    fixture.engine.tick(),
    fixture.engine.tick(),
    fixture.engine.tick(),
  ]);
  await fixture.engine.waitForIdle();
  assert.equal(fixture.api.claims.length, 1);
  assert.equal(fixture.printer.prints.length, 1);
  assert.equal(fixture.api.completed.length, 1);
});

test("offline printer records Error, submits nothing, and auto-pauses the queue", async (t) => {
  const fixture = await createEngine([
    order(IDS[0], "2026-07-18T10:00:00.000Z"),
  ]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
  fixture.printer.ready = false;

  await fixture.engine.tick();
  await fixture.engine.waitForIdle();
  assert.deepEqual(fixture.api.claims, [IDS[0]]);
  assert.deepEqual(fixture.printer.prints, []);
  assert.equal(fixture.api.errors.length, 1);
  assert.match(fixture.api.errors[0].reason, /printer is not ready: offline/i);
  assert.equal(fixture.settings.value.paused, true);
  assert.equal(fixture.engine.getState().paused, true);
  assert.equal(fixture.engine.getState().lastError.code, "PRINTER_OFFLINE");
});

test("lost completion response is retried from outbox without reprinting", async (t) => {
  const fixture = await createEngine([
    order(IDS[0], "2026-07-18T10:00:00.000Z"),
  ]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
  fixture.api.completeFailures = 1;

  await fixture.engine.tick();
  await fixture.engine.waitForIdle();
  assert.deepEqual(fixture.printer.prints, [IDS[0]]);
  assert.equal(fixture.session.outbox.length, 1);
  assert.equal(fixture.engine.getState().needsReview.phase, "printed");

  await fixture.engine.tick();
  await fixture.engine.waitForIdle();
  assert.deepEqual(fixture.printer.prints, [IDS[0]]);
  assert.equal(fixture.api.completed.length, 2);
  assert.equal(fixture.session.outbox.length, 0);
  assert.equal(fixture.engine.getState().needsReview, null);
});

test("operator can safely mark a recovered Printing order as Error without printing", async (t) => {
  const recovered = {
    ...order(IDS[0], "2026-07-18T10:00:00.000Z"),
    status: "Printing",
    claimable: false,
  };
  const fixture = await createEngine([recovered]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
  await fixture.session.saveClaim(IDS[0], "z".repeat(43));
  fixture.engine.state.needsReview = {
    jobId: IDS[0],
    phase: "printing-recovered",
    reason: "Agent restarted while printing",
  };

  const result = await fixture.engine.resolveNeedsReviewAsError(
    "Operator confirmed the interrupted print outcome"
  );

  assert.equal(result.reported, true);
  assert.equal(fixture.engine.getState().needsReview, null);
  assert.equal(fixture.printer.prints.length, 0);
  assert.deepEqual(fixture.api.errors, [
    {
      id: IDS[0],
      reason: "Operator confirmed the interrupted print outcome",
    },
  ]);
});

test("cancel during server start acknowledgement never submits to Windows", async (t) => {
  const fixture = await createEngine([
    order(IDS[0], "2026-07-18T10:00:00.000Z"),
  ]);
  t.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));

  let releaseStart;
  let enteredStart;
  const startEntered = new Promise((resolve) => {
    enteredStart = resolve;
  });
  const startRelease = new Promise((resolve) => {
    releaseStart = resolve;
  });
  fixture.api.markStarted = async (id) => {
    fixture.api.started.push(id);
    fixture.api.orders.find((entry) => entry.id === id).status = "Printing";
    enteredStart();
    await startRelease;
    return { success: true };
  };

  await fixture.engine.tick();
  await startEntered;
  const cancellation = fixture.engine.cancelCurrent();
  releaseStart();
  await cancellation;
  await fixture.engine.waitForIdle();

  assert.deepEqual(fixture.printer.prints, []);
  assert.equal(fixture.session.outbox.length, 0);
});
