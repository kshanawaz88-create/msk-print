"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_SETTINGS = Object.freeze({
  apiBaseUrl: "http://localhost:5000",
  selectedPrinter: "",
  paused: false,
  mappings: {
    paperSize: { A4: "", A3: "" },
    printType: { blackWhite: "", color: "" },
    orientation: { portrait: "", landscape: "" },
    duplex: { simplex: "", duplex: "" },
  },
  printDefaults: {
    orientation: "portrait",
    duplexMode: "duplex",
  },
  journal: null,
});

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const mergeSettings = (current, patch) => ({
  ...current,
  ...patch,
  mappings: {
    ...current.mappings,
    ...(patch.mappings || {}),
    paperSize: {
      ...current.mappings.paperSize,
      ...(patch.mappings?.paperSize || {}),
    },
    printType: {
      ...current.mappings.printType,
      ...(patch.mappings?.printType || {}),
    },
    orientation: {
      ...current.mappings.orientation,
      ...(patch.mappings?.orientation || {}),
    },
    duplex: {
      ...current.mappings.duplex,
      ...(patch.mappings?.duplex || {}),
    },
  },
  printDefaults: {
    ...current.printDefaults,
    ...(patch.printDefaults || {}),
  },
});

const atomicWriteJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporaryPath, filePath);
};

class SettingsStore {
  constructor(filePath) {
    if (!filePath) {
      throw new Error("A settings file path is required.");
    }
    this.filePath = filePath;
    this._writeChain = Promise.resolve();
  }

  async get() {
    await this._writeChain;
    return this._readUnlocked();
  }

  async _readUnlocked() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return mergeSettings(clone(DEFAULT_SETTINGS), this._sanitize(parsed));
    } catch (error) {
      if (error.code !== "ENOENT" && error.name !== "SyntaxError") {
        throw error;
      }
      return clone(DEFAULT_SETTINGS);
    }
  }

  async update(patch) {
    const safePatch = this._sanitize(patch);
    this._writeChain = this._writeChain.then(async () => {
      const current = await this._readUnlocked();
      const next = mergeSettings(current, safePatch);
      await atomicWriteJson(this.filePath, next);
      return clone(next);
    });
    return this._writeChain;
  }

  async clearJournal() {
    return this.update({ journal: null });
  }

  _sanitize(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const result = {};
    if (typeof value.apiBaseUrl === "string") {
      result.apiBaseUrl = value.apiBaseUrl.slice(0, 500);
    }
    if (typeof value.selectedPrinter === "string") {
      result.selectedPrinter = value.selectedPrinter.slice(0, 200);
    }
    if (typeof value.paused === "boolean") {
      result.paused = value.paused;
    }
    if (value.mappings && typeof value.mappings === "object") {
      result.mappings = sanitizeMappings(value.mappings);
    }
    if (value.printDefaults && typeof value.printDefaults === "object") {
      result.printDefaults = {};
      if (value.printDefaults.orientation !== undefined) {
        result.printDefaults.orientation =
          value.printDefaults.orientation === "landscape"
            ? "landscape"
            : "portrait";
      }
      if (value.printDefaults.duplexMode !== undefined) {
        result.printDefaults.duplexMode = [
          "duplex",
          "duplexshort",
          "duplexlong",
        ].includes(value.printDefaults.duplexMode)
          ? value.printDefaults.duplexMode
          : "duplex";
      }
    }
    if (value.journal === null) {
      result.journal = null;
    } else if (value.journal && typeof value.journal === "object") {
      result.journal = {
        jobId: String(value.journal.jobId || "").slice(0, 24),
        phase: String(value.journal.phase || "").slice(0, 50),
        printerName: String(value.journal.printerName || "").slice(0, 200),
        updatedAt: String(value.journal.updatedAt || "").slice(0, 40),
      };
    }
    return result;
  }
}

const sanitizeMappings = (mappings) => {
  const result = {};
  const addSection = (name, keys) => {
    if (!mappings[name] || typeof mappings[name] !== "object") return;
    result[name] = Object.fromEntries(
      keys
        .filter((key) => typeof mappings[name][key] === "string")
        .map((key) => [key, mappings[name][key].slice(0, 200)])
    );
  };
  addSection("paperSize", ["A4", "A3"]);
  addSection("printType", ["blackWhite", "color"]);
  addSection("orientation", ["portrait", "landscape"]);
  addSection("duplex", ["simplex", "duplex"]);
  return result;
};

class SecureSessionStore {
  constructor(filePath, safeStorage) {
    if (!filePath) {
      throw new Error("A secure session file path is required.");
    }
    if (
      !safeStorage ||
      typeof safeStorage.isEncryptionAvailable !== "function" ||
      typeof safeStorage.encryptString !== "function" ||
      typeof safeStorage.decryptString !== "function"
    ) {
      throw new Error("Electron safeStorage is required for the print agent session.");
    }

    this.filePath = filePath;
    this.safeStorage = safeStorage;
    this._writeChain = Promise.resolve();
  }

  async getSession() {
    return this._read();
  }

  async setSession({ token, user = null, shop = null }) {
    if (typeof token !== "string" || token.length < 20) {
      throw new Error("A valid agent JWT is required.");
    }
    const current = await this._read();
    return this._write({
      ...current,
      token,
      user: sanitizeIdentity(user),
      shop: sanitizeIdentity(shop),
    });
  }

  async clearSession() {
    this._writeChain = this._writeChain.then(async () => {
      try {
        await fs.rm(this.filePath, { force: true });
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      return emptySession();
    });
    return this._writeChain;
  }

  async clearAuthentication() {
    return this._mutate((session) => ({
      ...session,
      token: null,
      user: null,
      shop: null,
    }));
  }

  async saveClaim(jobId, claimToken) {
    validateJobId(jobId);
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(claimToken || "")) {
      throw new Error("A valid print claim token is required.");
    }
    return this._mutate((session) => {
      session.claims[jobId] = claimToken;
      return session;
    });
  }

  async getClaim(jobId) {
    validateJobId(jobId);
    const session = await this._read();
    return session.claims[jobId] || null;
  }

  async deleteClaim(jobId) {
    validateJobId(jobId);
    return this._mutate((session) => {
      delete session.claims[jobId];
      return session;
    });
  }

  async enqueueOutbox(entry) {
    const safe = sanitizeOutboxEntry(entry);
    return this._mutate((session) => {
      const existingIndex = session.outbox.findIndex(
        (item) => item.jobId === safe.jobId && item.action === safe.action
      );
      if (existingIndex >= 0) {
        session.outbox[existingIndex] = safe;
      } else {
        session.outbox.push(safe);
      }
      return session;
    });
  }

  async listOutbox() {
    const session = await this._read();
    return clone(session.outbox);
  }

  async removeOutbox(jobId, action) {
    validateJobId(jobId);
    return this._mutate((session) => {
      session.outbox = session.outbox.filter(
        (item) => item.jobId !== jobId || item.action !== action
      );
      return session;
    });
  }

  async _mutate(mutator) {
    this._writeChain = this._writeChain.then(async () => {
      const current = await this._readUnlocked();
      return this._writeUnlocked(mutator(current));
    });
    return this._writeChain;
  }

  async _read() {
    await this._writeChain;
    return this._readUnlocked();
  }

  async _readUnlocked() {
    try {
      if (!this.safeStorage.isEncryptionAvailable()) {
        throw new Error("Secure credential storage is unavailable on this Windows account.");
      }
      const envelope = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      if (envelope.version !== 1 || typeof envelope.ciphertext !== "string") {
        throw new Error("The saved print agent session is invalid.");
      }
      const cleartext = this.safeStorage.decryptString(
        Buffer.from(envelope.ciphertext, "base64")
      );
      return normalizeSession(JSON.parse(cleartext));
    } catch (error) {
      if (error.code === "ENOENT") {
        return emptySession();
      }
      throw error;
    }
  }

  async _write(value) {
    this._writeChain = this._writeChain.then(() => this._writeUnlocked(value));
    return this._writeChain;
  }

  async _writeUnlocked(value) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is unavailable on this Windows account.");
    }
    const normalized = normalizeSession(value);
    const encrypted = this.safeStorage.encryptString(JSON.stringify(normalized));
    await atomicWriteJson(this.filePath, {
      version: 1,
      ciphertext: Buffer.from(encrypted).toString("base64"),
    });
    return clone(normalized);
  }
}

const emptySession = () => ({
  token: null,
  user: null,
  shop: null,
  claims: {},
  outbox: [],
});

const normalizeSession = (value) => ({
  token: typeof value?.token === "string" ? value.token : null,
  user: sanitizeIdentity(value?.user),
  shop: sanitizeIdentity(value?.shop),
  claims:
    value?.claims && typeof value.claims === "object" && !Array.isArray(value.claims)
      ? Object.fromEntries(
          Object.entries(value.claims).filter(
            ([jobId, token]) =>
              /^[a-f\d]{24}$/i.test(jobId) &&
              /^[A-Za-z0-9_-]{32,128}$/.test(token)
          )
        )
      : {},
  outbox: Array.isArray(value?.outbox)
    ? value.outbox.map(sanitizeOutboxEntry).filter(Boolean)
    : [],
});

const sanitizeIdentity = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const allowed = [
    "id",
    "_id",
    "fullName",
    "email",
    "role",
    "name",
    "shopName",
    "shopCode",
  ];
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => allowed.includes(key))
      .map(([key, entry]) => [key, String(entry)])
  );
};

const validateJobId = (jobId) => {
  if (!/^[a-f\d]{24}$/i.test(jobId || "")) {
    throw new Error("A valid print job ID is required.");
  }
};

const sanitizeOutboxEntry = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  validateJobId(entry.jobId);
  if (!["complete", "error", "cancel"].includes(entry.action)) {
    throw new Error("Invalid print outcome action.");
  }
  return {
    jobId: entry.jobId,
    action: entry.action,
    payload:
      entry.payload && typeof entry.payload === "object"
        ? {
            printerName:
              typeof entry.payload.printerName === "string"
                ? entry.payload.printerName.slice(0, 200)
                : undefined,
            errorReason:
              typeof entry.payload.errorReason === "string"
                ? entry.payload.errorReason.slice(0, 500)
                : undefined,
          }
        : {},
    createdAt: entry.createdAt || new Date().toISOString(),
  };
};

module.exports = {
  DEFAULT_SETTINGS,
  SettingsStore,
  SecureSessionStore,
};
