"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

class QueueEngine extends EventEmitter {
  constructor({
    api,
    printerService,
    settingsStore,
    sessionStore,
    logger = null,
    pollIntervalMs = 5_000,
    randomToken = () => crypto.randomBytes(32).toString("base64url"),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = () => new Date(),
    tempDirectory = path.join(os.tmpdir(), "msk-print-agent"),
  }) {
    super();
    if (!api || !printerService || !settingsStore || !sessionStore) {
      throw new Error("QueueEngine requires API, printer, settings, and session services.");
    }
    this.api = api;
    this.printerService = printerService;
    this.settingsStore = settingsStore;
    this.sessionStore = sessionStore;
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.randomToken = randomToken;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.tempDirectory = tempDirectory;
    this.timer = null;
    this.pollPromise = null;
    this.processingPromise = null;
    this.stopping = false;
    this.state = {
      running: false,
      paused: false,
      connected: false,
      orders: [],
      history: [],
      counts: { waiting: 0, printing: 0, completed: 0, errors: 0 },
      current: null,
      needsReview: null,
      lastError: null,
      lastPollAt: null,
    };
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  async start() {
    if (this.state.running) return this.getState();
    const settings = await this.settingsStore.get();
    this.state.paused = Boolean(settings.paused);
    this.state.running = true;
    this.stopping = false;
    this._recoverJournal(settings.journal);
    this._emitState();
    await this.tick();
    this._schedule();
    return this.getState();
  }

  async stop() {
    this.stopping = true;
    this.state.running = false;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.pollPromise) {
      await this.pollPromise.catch(() => {});
    }
    this._emitState();
  }

  async tick() {
    if (this.pollPromise) {
      return this.pollPromise;
    }
    this.pollPromise = this._poll().finally(() => {
      this.pollPromise = null;
    });
    return this.pollPromise;
  }

  async pause() {
    this.state.paused = true;
    await this.settingsStore.update({ paused: true });
    await this.logger?.info("queue-paused");
    this._emitState();
    return this.getState();
  }

  async resume() {
    this.state.paused = false;
    await this.settingsStore.update({ paused: false });
    await this.logger?.info("queue-resumed");
    this._emitState();
    await this.tick();
    return this.getState();
  }

  async printNow(jobId) {
    if (this.processingPromise) {
      throw new Error("Another print job is already active.");
    }
    const order = this.state.orders.find((entry) => getJobId(entry) === jobId);
    if (!order) {
      throw new Error("The selected order is no longer in the print queue.");
    }
    if (!isEligible(order, true)) {
      throw new Error("Only a paid, pending order can be printed.");
    }
    this._launchProcess(order);
    return this.waitForIdle();
  }

  async cancelCurrent() {
    const current = this.state.current;
    if (!current) {
      return { cancelled: false, reason: "NO_ACTIVE_PRINT" };
    }
    current.cancelRequested = true;
    this._emitState();
    const spoolResult = await this.printerService.cancelCurrent();
    const beforeWindowsSubmission = ["claiming", "downloading", "starting"].includes(
      current.phase
    );
    const spoolRemovalConfirmed =
      Array.isArray(spoolResult.cancelledJobIds) &&
      spoolResult.cancelledJobIds.length > 0;
    if (beforeWindowsSubmission || spoolRemovalConfirmed) {
      await this._reportOutcome(current.jobId, "cancel", {
        errorReason: "Cancelled by print agent operator",
      });
    } else {
      this.state.needsReview = {
        jobId: current.jobId,
        phase: "cancel-pending",
        reason:
          "Cancellation was requested, but Windows has not yet confirmed removal from the print spooler.",
      };
      this._emitState();
    }
    await this.logger?.warn("print-cancelled", {
      jobId: current.jobId,
      printerName: current.printerName,
    });
    return { cancelled: true, spool: spoolResult };
  }

  async reprint(jobId) {
    if (this.processingPromise) {
      throw new Error("Another print job is already active.");
    }
    const claimToken = this.randomToken();
    await this.sessionStore.saveClaim(jobId, claimToken);
    let response;
    try {
      response = await this.api.reprint(jobId, claimToken);
    } catch (error) {
      await this.sessionStore.deleteClaim(jobId);
      throw error;
    }
    const order = unwrapJob(response);
    if (!order) {
      await this.sessionStore.deleteClaim(jobId);
      throw new Error("The server did not return the reprint order.");
    }
    this._launchProcess(order);
    return this.waitForIdle();
  }

  async resolveNeedsReviewAsError(reason) {
    const review = this.state.needsReview;
    if (!review?.jobId) {
      throw new Error("There is no interrupted print to resolve.");
    }
    const pending = await this.sessionStore.listOutbox();
    if (
      pending.some(
        (entry) => entry.jobId === review.jobId && entry.action === "complete"
      )
    ) {
      throw new Error(
        "This print already finished and its completion is waiting to sync."
      );
    }
    const claimToken = await this.sessionStore.getClaim(review.jobId);
    if (!claimToken) {
      throw new Error("The saved claim for this interrupted print is unavailable.");
    }
    const message =
      typeof reason === "string" && reason.trim()
        ? reason.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500)
        : "Operator marked an interrupted print attempt as Error";
    const reported = await this._reportOutcome(review.jobId, "error", {
      errorReason: message,
      printerName: review.printerName,
    });
    if (reported) {
      this.state.needsReview = null;
      this._emitState();
    }
    return { reported, state: this.getState() };
  }

  async waitForIdle() {
    await this.processingPromise?.catch(() => {});
    return this.getState();
  }

  _schedule() {
    if (!this.state.running || this.stopping || this.timer) return;
    this.timer = this.setTimer(async () => {
      this.timer = null;
      try {
        await this.tick();
      } finally {
        this._schedule();
      }
    }, this.pollIntervalMs);
  }

  async _poll() {
    try {
      await this._flushOutbox();
      const [queueResponse, historyResponse] = await Promise.all([
        this.api.getQueue(),
        this.api.getHistory(),
      ]);
      const orders = normalizeOrders(queueResponse).sort(compareOrders);
      const history = normalizeOrders(historyResponse).sort(compareOrders).reverse();
      for (const order of orders) {
        const localClaim = await this.sessionStore.getClaim(getJobId(order));
        if (localClaim) {
          order.localClaimAvailable = true;
          if (
            order.status === "Printing" &&
            !this.processingPromise &&
            this.state.needsReview?.jobId !== getJobId(order)
          ) {
            this.state.needsReview = {
              jobId: getJobId(order),
              phase: "printing-recovered",
              reason:
                "This order was already marked Printing before the current session. It will not be printed again automatically.",
            };
          }
        }
      }
      this.state.orders = orders;
      this.state.history = history;
      this.state.counts = normalizeCounts(
        queueResponse?.counts,
        historyResponse?.counts,
        orders,
        history
      );
      this.state.connected = true;
      this.state.lastError = null;
      this.state.lastPollAt = this.now().toISOString();
      this._emitState();

      if (!this.state.paused && !this.processingPromise && !this.state.needsReview) {
        const next = orders.find((entry) => isEligible(entry, false));
        if (next) this._launchProcess(next);
      }
    } catch (error) {
      this.state.connected = false;
      this.state.lastError = safeError(error);
      this.state.lastPollAt = this.now().toISOString();
      await this.logger?.warn("queue-poll-failed", {
        code: error.code,
        message: error.message,
      });
      this._emitState();
    }
    return this.getState();
  }

  _launchProcess(order) {
    if (this.processingPromise) return this.processingPromise;
    this.state.current = {
      jobId: getJobId(order),
      order,
      printerName: null,
      phase: "preparing",
      cancelRequested: false,
      startedAt: null,
    };
    this._emitState();
    this.processingPromise = this._process(order)
      .catch(async (error) => {
        this.state.lastError = safeError(error);
        await this.logger?.error("queue-processing-failed", {
          jobId: getJobId(order),
          code: error.code,
          message: error.message,
        });
      })
      .finally(() => {
        this.processingPromise = null;
        this.state.current = null;
        this._emitState();
      });
    return this.processingPromise;
  }

  async _process(initialOrder) {
    const jobId = getJobId(initialOrder);
    if (!jobId) throw new Error("Print queue order is missing its ID.");
    const settings = await this.settingsStore.get();
    const printerName = this.printerService.resolvePrinter(initialOrder, settings);
    if (!printerName) {
      throw new Error("Select a printer before starting the queue.");
    }

    this.state.current = {
      jobId,
      order: initialOrder,
      printerName,
      phase: "claiming",
      cancelRequested: false,
      startedAt: null,
    };
    this._emitState();

    let claimToken = await this.sessionStore.getClaim(jobId);
    let order = initialOrder;
    let filePath = null;
    let claimAcknowledged = false;
    let serverStartAcknowledged = false;
    try {
      if (!claimToken) {
        claimToken = this.randomToken();
        await this.sessionStore.saveClaim(jobId, claimToken);
      }
      const claimResponse = await this.api.claim(jobId, claimToken);
      claimAcknowledged = true;
      order = unwrapJob(claimResponse) || order;
      await this._journal(jobId, "claimed", printerName);
      const readiness = await this.printerService.isPrinterReady(printerName);
      if (!readiness.ready) {
        const error = new Error(`Printer is not ready: ${readiness.status}.`);
        error.code = readiness.printer?.paperOut ? "PAPER_OUT" : "PRINTER_OFFLINE";
        await this.logger?.warn(
          error.code === "PAPER_OUT" ? "printer-paper-out" : "printer-offline",
          { printerName }
        );
        throw error;
      }
      this._setPhase("downloading");

      filePath = await this._tempPath(order);
      await this.api.downloadFile(jobId, claimToken, filePath);
      await this._journal(jobId, "downloaded", printerName);

      this._setPhase("starting");
      await this._journal(jobId, "starting", printerName);
      try {
        await this.api.markStarted(jobId, claimToken, printerName);
        serverStartAcknowledged = true;
      } catch (error) {
        this.state.needsReview = {
          jobId,
          reason:
            "The server start acknowledgement was lost. The file was not sent to Windows.",
          phase: "start-uncertain",
        };
        await this._journal(jobId, "start-uncertain", printerName);
        await this._reportOutcome(jobId, "error", {
          printerName,
          errorReason:
            "Print agent could not confirm the server start acknowledgement; printing was not attempted.",
        });
        throw error;
      }

      if (this.state.current?.cancelRequested) {
        await this._reportOutcome(jobId, "cancel", {
          errorReason: "Cancelled before the file was submitted to Windows",
        });
        return;
      }
      this.state.current.startedAt = this.now().toISOString();
      this._setPhase("printing");
      await this._journal(jobId, "started", printerName);
      if (this.state.current?.cancelRequested) {
        await this._reportOutcome(jobId, "cancel", {
          errorReason: "Cancelled before the file was submitted to Windows",
        });
        return;
      }
      const result = await this.printerService.printJob(filePath, order, settings);

      if (this.state.current?.cancelRequested) {
        return;
      }
      this._setPhase("reporting-complete");
      await this._journal(jobId, "printed", printerName);
      const reported = await this._reportOutcome(jobId, "complete", {
        printerName: result.printerName || printerName,
      });
      if (reported) {
        this.state.needsReview = null;
      } else {
        this.state.needsReview = {
          jobId,
          reason:
            "Printing finished, but the server has not acknowledged completion. The agent will retry only the status update.",
          phase: "printed",
        };
      }
    } catch (error) {
      if (this.state.current?.cancelRequested) {
        if (error.code === "PRINT_CANCELLED") {
          const reported = await this._reportOutcome(jobId, "cancel", {
            errorReason: "Cancelled by print agent operator",
          });
          if (reported) this.state.needsReview = null;
        }
        return;
      }
      if (!claimAcknowledged) {
        if (error.retriable === false) {
          await this.sessionStore.deleteClaim(jobId);
        }
        throw error;
      }
      if (
        !serverStartAcknowledged &&
        this.state.current?.phase !== "starting" &&
        error.retriable === true
      ) {
        await this._journal(jobId, "claimed", printerName);
        await this.logger?.warn("print-preparation-deferred", {
          jobId,
          code: error.code,
          message: error.message,
        });
        throw error;
      }
      if (["PRINTER_OFFLINE", "PAPER_OUT"].includes(error.code)) {
        this.state.paused = true;
        await this.settingsStore.update({ paused: true });
        await this.logger?.warn("queue-auto-paused", {
          reason: error.code,
          printerName,
        });
      }
      if (serverStartAcknowledged) {
        const reason = error.ambiguous
          ? `Print outcome requires review: ${error.message}`
          : `Printing failed: ${error.message}`;
        await this._journal(jobId, error.ambiguous ? "ambiguous" : "failed", printerName);
        const reported = await this._reportOutcome(jobId, "error", {
          printerName,
          errorReason: reason.slice(0, 500),
        });
        this.state.needsReview = reported
          ? null
          : { jobId, reason, phase: error.ambiguous ? "ambiguous" : "failed" };
      } else if (this.state.current?.phase !== "starting") {
        await this._reportOutcome(jobId, "error", {
          printerName,
          errorReason: `Print preparation failed: ${error.message}`.slice(0, 500),
        });
      }
      throw error;
    } finally {
      if (filePath) {
        await fs.rm(filePath, { force: true }).catch(async (error) => {
          await this.logger?.warn("temporary-file-cleanup-failed", {
            jobId,
            message: error.message,
          });
        });
      }
    }
  }

  async _reportOutcome(jobId, action, payload) {
    const claimToken = await this.sessionStore.getClaim(jobId);
    if (!claimToken) {
      await this.logger?.warn("print-outcome-claim-missing", { jobId, action });
      return false;
    }
    await this.sessionStore.enqueueOutbox({
      jobId,
      action,
      payload,
      createdAt: this.now().toISOString(),
    });
    try {
      await this._sendOutcome(jobId, action, claimToken, payload);
      await this._acknowledgeOutcome(jobId, action);
      return true;
    } catch (error) {
      this.state.connected = false;
      await this.logger?.warn("print-outcome-deferred", {
        jobId,
        action,
        code: error.code,
        message: error.message,
      });
      return false;
    }
  }

  async _flushOutbox() {
    const entries = await this.sessionStore.listOutbox();
    for (const entry of entries) {
      const claimToken = await this.sessionStore.getClaim(entry.jobId);
      if (!claimToken) {
        await this.logger?.error("outbox-claim-missing", {
          jobId: entry.jobId,
          action: entry.action,
        });
        continue;
      }
      try {
        await this._sendOutcome(
          entry.jobId,
          entry.action,
          claimToken,
          entry.payload
        );
        await this._acknowledgeOutcome(entry.jobId, entry.action);
        if (this.state.needsReview?.jobId === entry.jobId) {
          this.state.needsReview = null;
        }
      } catch (error) {
        if (error.retriable === false) {
          this.state.needsReview = {
            jobId: entry.jobId,
            phase: "outcome-rejected",
            reason: `The server rejected the saved ${entry.action} update: ${error.message}`,
          };
        }
        throw error;
      }
    }
  }

  _sendOutcome(jobId, action, claimToken, payload) {
    if (action === "complete") {
      return this.api.markComplete(jobId, claimToken, payload.printerName);
    }
    if (action === "error") {
      return this.api.markError(
        jobId,
        claimToken,
        payload.errorReason,
        payload.printerName
      );
    }
    return this.api.cancel(jobId, claimToken, payload.errorReason);
  }

  async _acknowledgeOutcome(jobId, action) {
    await this.sessionStore.removeOutbox(jobId, action);
    await this.sessionStore.deleteClaim(jobId);
    const settings = await this.settingsStore.get();
    if (settings.journal?.jobId === jobId) {
      await this.settingsStore.clearJournal();
    }
  }

  async _journal(jobId, phase, printerName) {
    await this.settingsStore.update({
      journal: {
        jobId,
        phase,
        printerName,
        updatedAt: this.now().toISOString(),
      },
    });
  }

  _recoverJournal(journal) {
    if (!journal?.jobId) return;
    const uncertainPhases = new Set([
      "starting",
      "start-uncertain",
      "started",
      "printing",
      "printed",
      "ambiguous",
      "failed",
    ]);
    if (uncertainPhases.has(journal.phase)) {
      this.state.needsReview = {
        jobId: journal.jobId,
        phase: journal.phase,
        reason:
          journal.phase === "printed"
            ? "A completed print status is waiting to be reconciled with the server."
            : "The agent was interrupted after the print workflow started. It will not print this order again automatically.",
      };
    }
  }

  async _tempPath(order) {
    await fs.mkdir(this.tempDirectory, { recursive: true });
    const filename = String(order.fileName || "");
    const extension = [".pdf", ".jpg", ".jpeg", ".png"].includes(
      path.extname(filename).toLowerCase()
    )
      ? path.extname(filename).toLowerCase()
      : ".pdf";
    return path.join(this.tempDirectory, `${getJobId(order)}${extension}`);
  }

  _setPhase(phase) {
    if (!this.state.current) return;
    this.state.current.phase = phase;
    this._emitState();
  }

  _emitState() {
    this.emit("state", this.getState());
  }
}

const getJobId = (job) => String(job?.id || job?._id || "");

const normalizeOrders = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.queue)) return response.queue;
  if (Array.isArray(response?.history)) return response.history;
  if (Array.isArray(response?.orders)) return response.orders;
  if (Array.isArray(response?.jobs)) return response.jobs;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

const unwrapJob = (response) =>
  response?.job || response?.order || response?.data || null;

const compareOrders = (left, right) => {
  const dateDifference =
    new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  return dateDifference || getJobId(left).localeCompare(getJobId(right));
};

const isEligible = (order, manual) => {
  if (order.paymentStatus !== "Paid" || order.status !== "Pending") return false;
  if (order.claimedByThisAgent || order.localClaimAvailable) return true;
  if (manual) return order.claimable !== false;
  return order.claimable === true || order.claimable === undefined;
};

const normalizeCounts = (queueCounts, historyCounts, orders, history) => ({
  waiting:
    Number(queueCounts?.waiting) ||
    orders.filter((entry) => entry.status === "Pending").length,
  printing:
    Number(queueCounts?.printing) ||
    orders.filter((entry) => entry.status === "Printing").length,
  completed:
    Number(historyCounts?.completed ?? queueCounts?.completed) ||
    history.filter((entry) => entry.status === "Completed").length,
  errors:
    Number(historyCounts?.errors ?? queueCounts?.errors) ||
    history.filter((entry) => entry.status === "Error").length,
});

const safeError = (error) => ({
  code: error?.code || "AGENT_ERROR",
  message: String(error?.message || "Unexpected print agent error.").slice(0, 500),
});

module.exports = {
  QueueEngine,
  compareOrders,
  isEligible,
};
