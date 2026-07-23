const byId = (id) => document.getElementById(id);

const state = {
  authenticated: false,
  user: null,
  shop: null,
  queue: [],
  history: [],
  counts: { waiting: 0, printing: 0, completed: 0, errors: 0 },
  printers: [],
  selectedPrinter: "",
  mappings: {},
  paused: false,
  connected: false,
  currentJobId: null,
  needsReview: null,
  polledAt: null,
  logs: [],
};

const text = (value, fallback = "—") =>
  value === undefined || value === null || value === "" ? fallback : String(value);
const dateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
};
const setHidden = (element, hidden) => element.classList.toggle("hidden", hidden);
const badgeClass = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (["online", "ready", "completed"].includes(normalized)) return "online";
  if (["offline", "error", "cancelled"].includes(normalized)) return "error";
  if (normalized === "printing") return "printing";
  return "pending";
};
const badge = (value) => {
  const element = document.createElement("span");
  element.className = `badge ${badgeClass(value)}`;
  element.textContent = text(value);
  return element;
};

const showMessage = (message, kind = "error") => {
  const node = byId("globalMessage");
  node.textContent = message || "";
  node.className = `alert ${kind}`;
  setHidden(node, !message);
  if (message) setTimeout(() => setHidden(node, true), 6000);
};

const printerOptions = (select, includeAutomatic = false) => {
  const current = select.value;
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = includeAutomatic ? "Automatic / selected printer" : "Select a printer";
  select.append(blank);
  state.printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer.name;
    option.textContent = `${printer.name}${printer.isDefault ? " (Default)" : ""}`;
    select.append(option);
  });
  select.value = current;
};

const renderPrinters = () => {
  const body = byId("printerRows");
  body.replaceChildren();
  state.printers.forEach((printer) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = text(printer.name);
    const status = document.createElement("td");
    status.append(badge(printer.status || "Unknown"));
    const defaultPrinter = document.createElement("td");
    defaultPrinter.textContent = printer.isDefault ? "Yes" : "No";
    row.append(name, status, defaultPrinter);
    body.append(row);
  });
  setHidden(byId("printerEmpty"), state.printers.length > 0);

  [
    byId("selectedPrinter"),
    byId("mapA4"),
    byId("mapA3"),
    byId("mapBlackWhite"),
    byId("mapColor"),
    byId("mapPortrait"),
    byId("mapLandscape"),
    byId("mapSimplex"),
    byId("mapDuplexPrinter"),
  ].forEach((select, index) => printerOptions(select, index > 0));
  byId("selectedPrinter").value = state.selectedPrinter || "";
  byId("mapA4").value = state.mappings.a4 || "";
  byId("mapA3").value = state.mappings.a3 || "";
  byId("mapBlackWhite").value = state.mappings.blackWhite || "";
  byId("mapColor").value = state.mappings.color || "";
  byId("mapPortrait").value = state.mappings.portrait || "";
  byId("mapLandscape").value = state.mappings.landscape || "";
  byId("mapSimplex").value = state.mappings.simplex || "";
  byId("mapDuplexPrinter").value = state.mappings.duplexPrinter || "";
  byId("mapOrientation").value = state.mappings.orientation || "auto";
  byId("mapDuplex").value = state.mappings.duplex || "auto";
};

const createActionButton = (label, className, handler, disabled = false) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button small ${className}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
};

const orderCells = (job) => {
  const values = [
    job.customer,
    job.fileName,
    job.pages,
    job.copies,
    job.paperSize,
    `${text(job.printType)} / ${text(job.side)}`,
    dateTime(job.createdAt),
  ];
  return values.map((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = text(value);
    if (index === 1) {
      cell.className = "file-cell";
      cell.title = text(value);
    }
    return cell;
  });
};

const renderOrders = () => {
  const queueBody = byId("queueRows");
  queueBody.replaceChildren();
  state.queue.forEach((job) => {
    const row = document.createElement("tr");
    orderCells(job).forEach((cell) => row.append(cell));
    const status = document.createElement("td");
    status.append(badge(job.status));
    if (job.errorReason) status.title = job.errorReason;
    const action = document.createElement("td");
    const canPrint =
      job.status === "Pending" &&
      (job.claimable || job.claimedByThisAgent || job.localClaimAvailable);
    action.append(createActionButton(
      "Print Now",
      "primary",
      () => invoke("printNow", job.id),
      !canPrint || Boolean(state.currentJobId)
    ));
    row.append(status, action);
    queueBody.append(row);
  });
  setHidden(byId("queueEmpty"), state.queue.length > 0);

  const historyBody = byId("historyRows");
  historyBody.replaceChildren();
  state.history.forEach((job) => {
    const row = document.createElement("tr");
    orderCells(job).forEach((cell) => row.append(cell));
    const status = document.createElement("td");
    status.append(badge(job.status));
    if (job.errorReason) status.title = job.errorReason;
    const action = document.createElement("td");
    action.append(createActionButton(
      "Reprint",
      "subtle",
      () => {
        if (window.confirm("Create a new physical print attempt for this order?")) {
          invoke("reprint", job.id);
        }
      },
      Boolean(state.currentJobId)
    ));
    row.append(status, action);
    historyBody.append(row);
  });
  setHidden(byId("historyEmpty"), state.history.length > 0);
};

const renderLogs = () => {
  const body = byId("logRows");
  body.replaceChildren();
  state.logs.slice(0, 100).forEach((entry) => {
    const row = document.createElement("li");
    [dateTime(entry.timestamp), text(entry.event), text(entry.message, "")]
      .forEach((value) => {
        const span = document.createElement("span");
        span.textContent = value;
        row.append(span);
      });
    body.append(row);
  });
  setHidden(byId("logEmpty"), state.logs.length > 0);
};

const render = () => {
  setHidden(byId("loginView"), state.authenticated);
  setHidden(byId("dashboardView"), !state.authenticated);
  if (!state.authenticated) return;

  byId("shopIdentity").textContent =
    `${text(state.shop?.shopName, "Shop")} · ${text(state.user?.fullName, "Agent")}`;
  const connection = byId("connectionBadge");
  connection.textContent = state.connected ? "Connected" : "Network interrupted";
  connection.className = `badge ${state.connected ? "online" : "offline"}`;
  byId("waitingCount").textContent = text(state.counts.waiting, "0");
  byId("printingCount").textContent = text(state.counts.printing, "0");
  byId("completedCount").textContent = text(state.counts.completed, "0");
  byId("errorCount").textContent = text(state.counts.errors, "0");
  byId("queueStatus").textContent = state.paused
    ? "Automatic printing is paused."
    : state.currentJobId
    ? "A print job is in progress."
    : "Automatic printing is running.";
  setHidden(byId("pauseButton"), state.paused);
  setHidden(byId("resumeButton"), !state.paused);
  byId("cancelButton").disabled = !state.currentJobId;
  byId("lastPolled").textContent = state.polledAt
    ? `Updated ${dateTime(state.polledAt)}`
    : "Waiting for first poll";
  const review = byId("reviewMessage");
  byId("reviewText").textContent = state.needsReview
    ? `Order ${text(state.needsReview.jobId)} needs operator review: ${text(state.needsReview.reason)}`
    : "";
  setHidden(review, !state.needsReview);
  renderPrinters();
  renderOrders();
  renderLogs();
};

const mergeState = (next) => {
  if (!next || typeof next !== "object") return;
  Object.assign(state, next);
  state.counts = { ...state.counts, ...(next.counts || {}) };
  state.mappings = { ...state.mappings, ...(next.mappings || {}) };
  render();
};

const invoke = async (method, ...args) => {
  try {
    const result = await window.printAgent[method](...args);
    if (result?.state) mergeState(result.state);
    if (result?.message) showMessage(result.message, "success");
    return result;
  } catch (error) {
    showMessage(error.message || "The operation failed");
    return null;
  }
};

byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = byId("loginButton");
  const error = byId("loginError");

  setHidden(error, true);

  button.disabled = true;

  try {
    const result = await window.printAgent.login({
      email: byId("email").value.trim(),
      password: byId("password").value,
    });

    byId("password").value = "";

    mergeState(result.state || result);
  } catch (loginError) {
    byId("password").value = "";

    error.textContent =
      loginError.message || "Unable to sign in";

    setHidden(error, false);
  } finally {
    button.disabled = false;
  }
});

byId("logoutButton").addEventListener("click", () => invoke("logout"));
byId("pauseButton").addEventListener("click", () => invoke("pauseQueue"));
byId("resumeButton").addEventListener("click", () => invoke("resumeQueue"));
byId("cancelButton").addEventListener("click", () => {
  if (window.confirm("Cancel the active Windows print job?")) invoke("cancelPrint");
});
byId("resolveReviewButton").addEventListener("click", () => {
  if (window.confirm("Mark this uncertain print attempt as Error without printing it again?")) {
    invoke("resolveReviewAsError");
  }
});
byId("refreshButton").addEventListener("click", () => invoke("refresh"));
byId("detectPrintersButton").addEventListener("click", () => invoke("detectPrinters"));
byId("selectedPrinter").addEventListener("change", (event) =>
  invoke("selectPrinter", event.target.value)
);
byId("mappingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  invoke("saveMappings", {
    a4: byId("mapA4").value,
    a3: byId("mapA3").value,
    blackWhite: byId("mapBlackWhite").value,
    color: byId("mapColor").value,
    portrait: byId("mapPortrait").value,
    landscape: byId("mapLandscape").value,
    simplex: byId("mapSimplex").value,
    duplexPrinter: byId("mapDuplexPrinter").value,
    orientation: byId("mapOrientation").value,
    duplex: byId("mapDuplex").value,
  });
});

window.printAgent.onState(mergeState);
window.printAgent.getState().then(mergeState).catch((error) => {
  byId("loginError").textContent = error.message || "Unable to start the print agent";
  setHidden(byId("loginError"), false);
});
