"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  safeStorage,
  session,
  Tray,
} = require("electron");

const { ApiClient } = require("./lib/apiClient");
const { AgentLogger } = require("./lib/logger");
const { PrinterService } = require("./lib/printerService");
const { QueueEngine } = require("./lib/queueEngine");
const { SettingsStore, SecureSessionStore } = require("./lib/settingsStore");

const JOB_ID = /^[a-f\d]{24}$/i;
const INDEX_FILE = path.join(__dirname, "renderer", "index.html");
const INDEX_URL = pathToFileURL(INDEX_FILE).href;
const launchedHidden = process.argv.includes("--hidden");

let mainWindow = null;
let tray = null;
let quitting = false;
let printers = [];
let settingsStore;
let sessionStore;
let logger;
let api;
let printerService;
let queueEngine;
let broadcastChain = Promise.resolve();

app.setName("MSK Print Agent");

const lockAcquired = app.requestSingleInstanceLock();
if (!lockAcquired) {
  app.quit();
}

const cleanText = (value, field, maxLength = 250) => {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new Error(`${field} is invalid.`);
  }
  return cleaned;
};

const validateJobId = (value) => {
  if (!JOB_ID.test(value || "")) throw new Error("Invalid print job ID.");
  return value;
};

const validatePassword = (value) => {
  if (
    typeof value !== "string" ||
    value.length < 6 ||
    value.length > 128 ||
    value.includes("\u0000")
  ) {
    throw new Error("Password is invalid.");
  }
  return value;
};

const validatePrinterName = (value, allowBlank = false) => {
  if (allowBlank && value === "") return "";
  const printerName = cleanText(value, "Printer name");
  if (!printers.some((printer) => printer.name === printerName)) {
    throw new Error("Select an installed Windows printer.");
  }
  return printerName;
};

const flattenMappings = (settings) => ({
  a4: settings.mappings?.paperSize?.A4 || "",
  a3: settings.mappings?.paperSize?.A3 || "",
  blackWhite: settings.mappings?.printType?.blackWhite || "",
  color: settings.mappings?.printType?.color || "",
  portrait: settings.mappings?.orientation?.portrait || "",
  landscape: settings.mappings?.orientation?.landscape || "",
  simplex: settings.mappings?.duplex?.simplex || "",
  duplexPrinter: settings.mappings?.duplex?.duplex || "",
  orientation: settings.printDefaults?.orientation || "portrait",
  duplex: settings.printDefaults?.duplexMode || "duplex",
});

const logMessage = (entry) => {
  const details = entry.details || {};
  return details.message ||
    [details.jobId && `Order ${details.jobId}`, details.printerName]
      .filter(Boolean)
      .join(" · ");
};

const getRendererState = async () => {
  const [savedSession, settings, logs] = await Promise.all([
    sessionStore.getSession(),
    settingsStore.get(),
    logger.recent(100),
  ]);
  const engineState = queueEngine.getState();
  return {
    authenticated: Boolean(savedSession.token),
    user: savedSession.user,
    shop: savedSession.shop,
    queue: engineState.orders,
    history: engineState.history,
    counts: engineState.counts,
    connected: engineState.connected,
    paused: engineState.paused,
    currentJobId: engineState.current?.jobId || null,
    current: engineState.current,
    needsReview: engineState.needsReview,
    lastError: engineState.lastError,
    polledAt: engineState.lastPollAt,
    printers,
    selectedPrinter: settings.selectedPrinter || "",
    mappings: flattenMappings(settings),
    logs: logs.reverse().map((entry) => ({
      timestamp: entry.timestamp,
      event: entry.event,
      message: logMessage(entry),
      level: entry.level,
    })),
  };
};

const sendState = () => {
  broadcastChain = broadcastChain
    .then(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("agent:state", await getRendererState());
      updateTrayMenu();
    })
    .catch((error) => {
      void logger?.warn("state-broadcast-failed", { message: error.message });
    });
  return broadcastChain;
};

const revealWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
};

const createTrayImage = () => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">',
    '<rect width="32" height="32" rx="7" fill="#214fc6"/>',
    '<path d="M8 8h16v7H8zm-2 8h20v9h-4v-5H10v5H6z" fill="white"/>',
    '<circle cx="22" cy="19" r="1.5" fill="#65d6a3"/>',
    "</svg>",
  ].join("");
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  ).resize({ width: 16, height: 16 });
};

const updateTrayMenu = () => {
  if (!tray || !queueEngine) return;
  const engineState = queueEngine.getState();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open MSK Print Agent", click: revealWindow },
    { type: "separator" },
    {
      label: engineState.paused ? "Resume Queue" : "Pause Queue",
      click: () => {
        const operation = engineState.paused
          ? queueEngine.resume()
          : queueEngine.pause();
        void operation.then(sendState).catch((error) =>
          logger.warn("tray-queue-control-failed", { message: error.message })
        );
      },
    },
    {
      label: "Detect Printers",
      click: () => void detectPrinters().catch((error) =>
        logger.warn("printer-detection-failed", { message: error.message })
      ),
    },
    { type: "separator" },
    {
      label: "Log Out",
      enabled: !engineState.current,
      click: () => void logout().catch((error) =>
        logger.warn("logout-failed", { message: error.message })
      ),
    },
    {
      label: "Quit",
      enabled: !engineState.current,
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    title: "MSK Print Agent",
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f3f5f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.loadFile(INDEX_FILE);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== INDEX_URL) event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.once("ready-to-show", () => {
    if (!launchedHidden) mainWindow.show();
  });
};

const detectPrinters = async () => {
  printers = await printerService.detectPrinters();
  const settings = await settingsStore.get();
  const selectedExists = printers.some(
    (printer) => printer.name === settings.selectedPrinter
  );
  if (!selectedExists) {
    const fallback = printers.find((printer) => printer.isDefault)?.name || "";
    if (settings.selectedPrinter !== fallback) {
      await settingsStore.update({ selectedPrinter: fallback });
    }
  }
  await logger.info("printers-detected", { count: printers.length });
  await sendState();
  return printers;
};

const login = async (credentials) => {
  if (!credentials || typeof credentials !== "object") {
    throw new Error("Login details are required.");
  }

  const request = {
    email: cleanText(
      credentials.email,
      "Email",
      254
    ).toLowerCase(),

    password: validatePassword(
      credentials.password
    ),
  };

  const response = await api.login(request);

  if (
    !response?.token ||
    !response?.user ||
    !response?.shop
  ) {
    throw new Error(
      response?.message ||
        "The server returned an invalid login response."
    );
  }

  const allowedRoles = [
    "admin",
    "shopOwner",
    "staff",
  ];

  if (!allowedRoles.includes(response.user.role)) {
    throw new Error(
      "Only administrators, shop owners, or authorized staff can use the Print Agent."
    );
  }

  await sessionStore.setSession({
    token: response.token,
    user: response.user,
    shop: response.shop,
  });

  await logger.info("agent-login", {
    userId: response.user.id,
    role: response.user.role,
    shopId: response.shop.id,
  });

  await detectPrinters();
  await queueEngine.start();
  await sendState();

  return {
    state: await getRendererState(),
  };
};

const logout = async () => {
  const engineState = queueEngine.getState();
  const savedSession = await sessionStore.getSession();
  if (engineState.current) {
    throw new Error("Wait for or cancel the active print before logging out.");
  }
  if (savedSession.outbox.length) {
    throw new Error("A print result is waiting to sync. Restore the network before logging out.");
  }
  if (Object.keys(savedSession.claims).length) {
    throw new Error("A claimed print order must be reconciled before logging out.");
  }
  await queueEngine.stop();
  await sessionStore.clearSession();
  await settingsStore.clearJournal();
  await logger.info("agent-logout");
  await sendState();
  return { state: await getRendererState() };
};

const trustedIpc = (event) => {
  if (event.senderFrame?.url !== INDEX_URL) {
    throw new Error("Untrusted print agent request.");
  }
};

const registerHandler = (channel, handler) => {
  ipcMain.handle(channel, async (event, ...args) => {
    trustedIpc(event);
    try {
      return await handler(...args);
    } catch (error) {
      await logger.warn("agent-action-failed", {
        action: channel,
        message: error.message,
        code: error.code,
      });
      throw new Error(String(error.message || "The operation failed.").slice(0, 500));
    }
  });
};

const registerIpc = () => {
  registerHandler("agent:get-state", () => getRendererState());
  registerHandler("agent:login", login);
  registerHandler("agent:logout", logout);
  registerHandler("agent:refresh", async () => {
    await detectPrinters();
    await queueEngine.tick();
    return { state: await getRendererState() };
  });
  registerHandler("agent:detect-printers", async () => {
    await detectPrinters();
    return { state: await getRendererState(), message: "Printer list refreshed." };
  });
  registerHandler("agent:select-printer", async (printerName) => {
    const selectedPrinter = validatePrinterName(printerName);
    await settingsStore.update({ selectedPrinter });
    await logger.info("printer-selected", { printerName: selectedPrinter });
    await sendState();
    return { state: await getRendererState(), message: "Selected printer saved." };
  });
  registerHandler("agent:save-mappings", async (value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Printer settings are invalid.");
    }
    const printer = (entry) => validatePrinterName(entry || "", true);
    const orientation = ["auto", "portrait", "landscape"].includes(value.orientation)
      ? value.orientation
      : "auto";
    const duplex = ["auto", "duplex", "duplexshort", "duplexlong"].includes(value.duplex)
      ? value.duplex
      : "auto";
    await settingsStore.update({
      mappings: {
        paperSize: { A4: printer(value.a4), A3: printer(value.a3) },
        printType: {
          blackWhite: printer(value.blackWhite),
          color: printer(value.color),
        },
        orientation: {
          portrait: printer(value.portrait),
          landscape: printer(value.landscape),
        },
        duplex: {
          simplex: printer(value.simplex),
          duplex: printer(value.duplexPrinter),
        },
      },
      printDefaults: {
        orientation: orientation === "auto" ? "portrait" : orientation,
        duplexMode: duplex === "auto" ? "duplex" : duplex,
      },
    });
    await logger.info("printer-mappings-saved");
    await sendState();
    return { state: await getRendererState(), message: "Printer settings saved." };
  });
  registerHandler("agent:pause", async () => {
    await queueEngine.pause();
    return {
      state: await getRendererState(),
      message: "Automatic queue paused.",
    };
  });
  registerHandler("agent:resume", async () => {
    await queueEngine.resume();
    return {
      state: await getRendererState(),
      message: "Automatic queue resumed.",
    };
  });
  registerHandler("agent:print-now", async (jobId) => {
    await queueEngine.printNow(validateJobId(jobId));
    return { state: await getRendererState() };
  });
  registerHandler("agent:cancel", async () => {
    const result = await queueEngine.cancelCurrent();
    await sendState();
    return {
      state: await getRendererState(),
      message: result.cancelled ? "Print cancellation requested." : "No active print.",
    };
  });
  registerHandler("agent:resolve-review-error", async () => {
    await queueEngine.resolveNeedsReviewAsError(
      "Print outcome was manually marked Error by the print agent operator."
    );
    await sendState();
    return {
      state: await getRendererState(),
      message: "The uncertain print order was marked Error.",
    };
  });
  registerHandler("agent:reprint", async (jobId) => {
    await queueEngine.reprint(validateJobId(jobId));
    return { state: await getRendererState() };
  });
};

const initialize = async () => {
  const userData = app.getPath("userData");

  settingsStore = new SettingsStore(
    path.join(userData, "settings.json")
  );

  sessionStore = new SecureSessionStore(
    path.join(userData, "secure-session.json"),
    safeStorage
  );

  logger = new AgentLogger(
    path.join(
      app.getPath("logs"),
      "print-agent.jsonl"
    )
  );

  const configuredUrl = process.env.MSK_PRINT_API_URL;

  if (configuredUrl) {
    await settingsStore.update({
      apiBaseUrl: configuredUrl,
    });
  }

  const settings = await settingsStore.get();

  console.log(
    "MSK Print Agent API URL:",
    settings.apiBaseUrl
  );

  api = new ApiClient({
    baseUrl: settings.apiBaseUrl,

    getToken: async () => {
      const savedSession =
        await sessionStore.getSession();

      return savedSession.token;
    },

    onUnauthorized: async () => {
      await sessionStore.clearAuthentication();

      await logger.warn(
        "agent-session-expired"
      );

      setImmediate(() => {
        void queueEngine
          .stop()
          .then(sendState);
      });
    },
  });

  printerService = new PrinterService({
    logger,
  });

  queueEngine = new QueueEngine({
    api,
    printerService,
    settingsStore,
    sessionStore,
    logger,
    tempDirectory: path.join(
      app.getPath("temp"),
      "msk-print-agent"
    ),
  });

  queueEngine.on(
    "state",
    () => void sendState()
  );

  session.defaultSession
    .setPermissionRequestHandler(
      (
        _webContents,
        _permission,
        callback
      ) => callback(false)
    );

  registerIpc();

  createWindow();

  tray = new Tray(createTrayImage());

  tray.setToolTip(
    "MSK Print Agent"
  );

  tray.on(
    "double-click",
    revealWindow
  );

  updateTrayMenu();

  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,

    args: app.isPackaged
      ? ["--hidden"]
      : [
          app.getAppPath(),
          "--hidden",
        ],
  });

  try {
    const savedSession =
      await sessionStore.getSession();

    await detectPrinters();

    if (savedSession.token) {
      await queueEngine.start();
    }
  } catch (error) {
    await logger.error(
      "agent-startup-failed",
      {
        message: error.message,
      }
    );

    await sendState();
  }

  powerMonitor.on(
    "resume",
    () => {
      void detectPrinters()
        .then(() =>
          queueEngine.tick()
        )
        .catch((error) =>
          logger.warn(
            "resume-refresh-failed",
            {
              message:
                error.message,
            }
          )
        );
    }
  );
};

if (lockAcquired) {
  app.on("second-instance", revealWindow);
  app.whenReady().then(initialize).catch((error) => {
    console.error("MSK Print Agent startup failed:", error.message);
    app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("window-all-closed", () => {
    // The queue remains active in the system tray.
  });
}
