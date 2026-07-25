"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

class PrinterError extends Error {
  constructor(message, { code = "PRINTER_ERROR", printerName = null, cause } = {}) {
    super(message, { cause });
    this.name = "PrinterError";
    this.code = code;
    this.printerName = printerName;
    this.ambiguous = false;
  }
}

class AmbiguousPrintError extends PrinterError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || "PRINT_OUTCOME_UNKNOWN" });
    this.name = "AmbiguousPrintError";
    this.ambiguous = true;
  }
}

const SCRIPT_FILES = Object.freeze({
  status: path.resolve(__dirname, "..", "scripts", "printer-status.ps1"),
  jobs: path.resolve(__dirname, "..", "scripts", "spool-jobs.ps1"),
  cancel: path.resolve(__dirname, "..", "scripts", "cancel-print.ps1"),
});

const runPowerShellScript = (
  scriptName,
  payload = {},
  { spawnImpl = spawn, timeoutMs = 15_000 } = {}
) =>
  new Promise((resolve, reject) => {
    const scriptPath = SCRIPT_FILES[scriptName];
    if (!scriptPath) {
      reject(new Error("Unknown print agent PowerShell script."));
      return;
    }

    const child = spawnImpl(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new PrinterError("Windows printer query timed out.", {
        code: "POWERSHELL_TIMEOUT",
      }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2 * 1024 * 1024) {
        child.kill();
        finish(new PrinterError("Windows printer query returned too much data.", {
          code: "POWERSHELL_OUTPUT_LIMIT",
        }));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64 * 1024) {
        stderr = stderr.slice(-64 * 1024);
      }
    });
    child.once("error", (error) => {
      finish(new PrinterError("Unable to run the Windows print service command.", {
        code: "POWERSHELL_START_FAILED",
        cause: error,
      }));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new PrinterError(
          stderr.trim() || `Windows print service command failed (${code}).`,
          { code: "POWERSHELL_FAILED" }
        ));
        return;
      }
      const raw = stdout.trim();
      if (!raw) {
        finish(null, null);
        return;
      }
      try {
        finish(null, JSON.parse(raw));
      } catch (error) {
        finish(new PrinterError("Windows returned invalid printer information.", {
          code: "POWERSHELL_INVALID_JSON",
          cause: error,
        }));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });

class PrinterService {
  constructor({
    pdfPrinter = null,
    powerShellRunner = runPowerShellScript,
    logger = null,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    spoolPollMs = 250,
    spoolDiscoveryMs = 8_000,
    spoolCompletionMs = 15 * 60_000,
  } = {}) {
    this.pdfPrinter = pdfPrinter;
    this.powerShellRunner = powerShellRunner;
    this.logger = logger;
    this.sleep = sleep;
    this.spoolPollMs = spoolPollMs;
    this.spoolDiscoveryMs = spoolDiscoveryMs;
    this.spoolCompletionMs = spoolCompletionMs;
    this.current = null;
  }

  _pdf() {
    if (!this.pdfPrinter) {
      // Loaded lazily so printer detection and tests do not require the native tool.
      this.pdfPrinter = require("pdf-to-printer");
    }
    return this.pdfPrinter;
  }

  async detectPrinters() {
    const pdfPrinters = normalizeArray(await this._pdf().getPrinters?.());
    const defaultValue = await this._pdf().getDefaultPrinter?.();
    const defaultName =
      typeof defaultValue === "string"
        ? defaultValue
        : defaultValue?.name || defaultValue?.printer || "";
    let windowsPrinters = [];
    try {
      windowsPrinters = normalizeArray(await this.powerShellRunner("status", {}));
    } catch (error) {
      await this.logger?.warn("printer-status-query-failed", {
        message: error.message,
      });
    }

    const records = new Map();
    for (const entry of pdfPrinters) {
      const name =
        typeof entry === "string"
          ? entry
          : entry?.name || entry?.printer || entry?.deviceName;
      if (name) {
        records.set(name, {
          name,
          status: "Unknown",
          isDefault: name === defaultName,
          online: true,
          paperOut: false,
        });
      }
    }

    for (const entry of windowsPrinters) {
      const name = entry?.Name || entry?.name;
      if (!name) continue;
      const state = windowsPrinterState(entry);
      records.set(name, {
        ...(records.get(name) || { name }),
        ...state,
        isDefault: Boolean(entry.Default ?? entry.default) || name === defaultName,
      });
      if (!state.online) {
        await this.logger?.warn("printer-offline", { printerName: name });
      }
      if (state.paperOut) {
        await this.logger?.warn("printer-paper-out", { printerName: name });
      }
    }

    return [...records.values()].sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.name.localeCompare(right.name)
    );
  }

  async isPrinterReady(printerName) {
    const printer = (await this.detectPrinters()).find(
      (entry) => entry.name === printerName
    );
    if (!printer) {
      return { ready: false, status: "Not installed", printer: null };
    }
    return {
      ready: printer.online && !printer.paperOut,
      status: printer.status,
      printer,
    };
  }

  resolvePrinter(job, settings) {
    const mappings = settings?.mappings || {};
    const paperSize = normalizePaperSize(job.paperSize);
    const printType = normalizePrintType(job.printType);
    const orientation = normalizeOrientation(job.orientation || settings?.printDefaults?.orientation);
    const duplex = normalizeSide(job.side);
    const candidates = [
      mappings.paperSize?.[paperSize],
      mappings.printType?.[printType],
      mappings.orientation?.[orientation],
      mappings.duplex?.[duplex],
      settings?.selectedPrinter,
    ];
    return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
  }

  buildPrintOptions(job, settings, printerName) {
    const side = normalizeSide(job.side);
    const configuredDuplex = settings?.printDefaults?.duplexMode;
    return {
      printer: printerName,
      copies: Math.max(1, Math.min(Number(job.copies) || 1, 999)),
      paperSize: normalizePaperSize(job.paperSize),
      monochrome: normalizePrintType(job.printType) === "blackWhite",
      orientation: normalizeOrientation(
        job.orientation || settings?.printDefaults?.orientation
      ),
      side:
        side === "duplex"
          ? ["duplex", "duplexshort", "duplexlong"].includes(configuredDuplex)
            ? configuredDuplex
            : "duplex"
          : "simplex",
      silent: true,
    };
  }

  async printJob(filePath, job, settings = {}) {
    const printerName = this.resolvePrinter(job, settings);
    if (!printerName) {
      throw new PrinterError("Select a printer before printing.", {
        code: "PRINTER_NOT_CONFIGURED",
      });
    }

    const readiness = await this.isPrinterReady(printerName);
    if (!readiness.ready) {
      const status = readiness.status || "Unavailable";
      const code = readiness.printer?.paperOut
        ? "PAPER_OUT"
        : readiness.printer
          ? "PRINTER_OFFLINE"
          : "PRINTER_NOT_FOUND";
      throw new PrinterError(`Printer is not ready: ${status}.`, {
        code,
        printerName,
      });
    }

    const baselineJobs = await this.getSpoolJobs(printerName);
    const baselineIds = new Set(baselineJobs.map((entry) => Number(entry.id)));
    const active = {
      printerName,
      spoolJobIds: [],
      cancelRequested: false,
      discoveryAborted: false,
    };
    const options = this.buildPrintOptions(job, settings, printerName);
    this.current = active;

    await this.logger?.info("print-submitting", {
      jobId: job.id || job._id,
      printerName,
    });

    try {
      try {
        await this._pdf().print(filePath, options);
      } catch (error) {
        throw new PrinterError("Unable to submit the document to Windows.", {
          code: "PRINT_SUBMISSION_FAILED",
          printerName,
          cause: error,
        });
      }

      const discovered = await this._discoverSpoolJobs(
        printerName,
        baselineIds,
        active
      );
      active.spoolJobIds = discovered.map((entry) => Number(entry.id));
      if (!active.spoolJobIds.length) {
        throw new AmbiguousPrintError(
          "Windows accepted the print request but no spool job could be confirmed.",
          { printerName, code: "SPOOL_JOB_NOT_FOUND" }
        );
      }

      await this._waitForSpoolCompletion(active);

      await this.logger?.info("print-success", {
        jobId: job.id || job._id,
        printerName,
        spoolJobIds: active.spoolJobIds,
      });

      return {
        success: true,
        printerName,
        spoolJobIds: [...active.spoolJobIds],
      };
    } finally {
      active.discoveryAborted = true;
      if (this.current === active) this.current = null;
    }
  }

  async cancelCurrent() {
    if (!this.current) {
      return {
        cancelled: false,
        reason: "NO_ACTIVE_PRINT",
      };
    }

    this.current.cancelRequested = true;

    if (!this.current.spoolJobIds.length) {
      return {
        cancelled: true,
        pendingSpoolDiscovery: true,
      };
    }

    const cancelledJobIds =
      await this._cancelSpoolJobs(
        this.current.printerName,
        this.current.spoolJobIds
      );

    return {
      cancelled: true,
      cancelledJobIds,
    };
  }

  async getSpoolJobs(printerName) {
    const result = normalizeArray(
      await this.powerShellRunner("jobs", { printerName })
    );
    return result.map((entry) => ({
      id: Number(entry.ID ?? entry.Id ?? entry.id),
      documentName: String(
        entry.DocumentName ?? entry.documentName ?? ""
      ),
      status: String(entry.JobStatus ?? entry.status ?? ""),
      submittedTime: entry.SubmittedTime ?? entry.submittedTime ?? null,
    }));
  }

  async _discoverSpoolJobs(printerName, baseline, active) {
    const deadline = Date.now() + this.spoolDiscoveryMs;
    while (Date.now() <= deadline && !active.discoveryAborted) {
      const jobs = await this.getSpoolJobs(printerName);
      const discovered = jobs.filter((entry) => !baseline.has(Number(entry.id)));
      if (discovered.length) {
        return discovered;
      }
      await this.sleep(this.spoolPollMs);
    }
    return [];
  }

  async _waitForSpoolCompletion(active) {
    const targetIds = new Set(active.spoolJobIds.map(Number));
    const deadline = Date.now() + this.spoolCompletionMs;
    while (Date.now() <= deadline) {
      if (active.cancelRequested) {
        await this._cancelSpoolJobs(active.printerName, [...targetIds]);
        throw new PrinterError("The print job was cancelled.", {
          code: "PRINT_CANCELLED",
          printerName: active.printerName,
        });
      }
      const jobs = (await this.getSpoolJobs(active.printerName)).filter((entry) =>
        targetIds.has(Number(entry.id))
      );
      if (!jobs.length) {
        return;
      }
      const failure = jobs.find((entry) =>
        /error|offline|paper\s*out|blocked|jam/i.test(entry.status)
      );
      if (failure) {
        throw new PrinterError(
          `Windows print spooler reported: ${failure.status || "print failure"}.`,
          {
            code: /paper/i.test(failure.status) ? "PAPER_OUT" : "SPOOL_ERROR",
            printerName: active.printerName,
          }
        );
      }
      await this.sleep(this.spoolPollMs);
    }
    throw new AmbiguousPrintError(
      "Windows did not confirm print completion before the safety timeout.",
      { printerName: active.printerName, code: "SPOOL_TIMEOUT" }
    );
  }

  async _cancelSpoolJobs(printerName, jobIds) {
    const response = await this.powerShellRunner("cancel", {
      printerName,
      jobIds: jobIds.map(Number).filter(Number.isInteger),
    });
    return normalizeArray(response?.cancelledJobIds);
  }
}

const normalizeArray = (value) =>
  value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];

const normalizePaperSize = (value) =>
  String(value || "A4").toUpperCase() === "A3" ? "A3" : "A4";

const normalizePrintType = (value) =>
  /color/i.test(String(value || "")) &&
  !/black|mono|b\s*&\s*w/i.test(String(value || ""))
    ? "color"
    : "blackWhite";

const normalizeOrientation = (value) =>
  /landscape/i.test(String(value || "")) ? "landscape" : "portrait";

const normalizeSide = (value) =>
  /double|duplex/i.test(String(value || "")) ? "duplex" : "simplex";

const windowsPrinterState = (entry) => {
  const offline =
    Boolean(entry.WorkOffline ?? entry.workOffline) ||
    Number(entry.PrinterStatus ?? entry.printerStatus) === 7 ||
    Number(entry.DetectedErrorState ?? entry.detectedErrorState) === 9;
  const errorState = Number(entry.DetectedErrorState ?? entry.detectedErrorState);
  const paperOut = errorState === 4;
  const paperLow = errorState === 3;
  const jam = errorState === 8;
  const stopped = Number(entry.PrinterStatus ?? entry.printerStatus) === 6;
  let status = "Ready";
  if (offline) status = "Offline";
  else if (paperOut) status = "Paper out";
  else if (jam) status = "Paper jam";
  else if (stopped) status = "Stopped";
  else if (paperLow) status = "Paper low";
  else if (Number(entry.PrinterStatus ?? entry.printerStatus) === 4) status = "Printing";
  return {
    status,
    online: !offline && !stopped && !jam,
    paperOut,
  };
};

module.exports = {
  PrinterService,
  PrinterError,
  AmbiguousPrintError,
  runPowerShellScript,
  windowsPrinterState,
};
