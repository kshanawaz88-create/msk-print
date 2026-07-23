"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|signature/i;

const redact = (value, depth = 0) => {
  if (depth > 5) {
    return "[TRUNCATED]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => redact(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(entry, depth + 1),
      ])
    );
  }
  if (typeof value === "string") {
    return value.slice(0, 2000);
  }
  return value;
};

class AgentLogger {
  constructor(filePath, { maxBytes = 2 * 1024 * 1024 } = {}) {
    if (!filePath) {
      throw new Error("A log file path is required.");
    }
    this.filePath = filePath;
    this.maxBytes = maxBytes;
    this._writeChain = Promise.resolve();
  }

  info(event, details = {}) {
    return this._append("info", event, details);
  }

  warn(event, details = {}) {
    return this._append("warn", event, details);
  }

  error(event, details = {}) {
    return this._append("error", event, details);
  }

  async recent(limit = 100) {
    await this._writeChain;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, Math.min(Number(limit) || 100, 500)))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { level: "error", event: "invalid-log-entry" };
          }
        });
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  _append(level, event, details) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event: String(event || "agent-event").slice(0, 200),
      details: redact(details),
    };
    this._writeChain = this._writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this._rotateIfNeeded();
      await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      return record;
    });
    return this._writeChain;
  }

  async _rotateIfNeeded() {
    try {
      const stats = await fs.stat(this.filePath);
      if (stats.size < this.maxBytes) {
        return;
      }
      await fs.rm(`${this.filePath}.1`, { force: true });
      await fs.rename(this.filePath, `${this.filePath}.1`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

module.exports = { AgentLogger, redact };
