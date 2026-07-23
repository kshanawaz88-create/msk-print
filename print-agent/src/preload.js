"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("printAgent", Object.freeze({
  getState: () => invoke("agent:get-state"),
  login: (credentials) => invoke("agent:login", credentials),
  logout: () => invoke("agent:logout"),
  refresh: () => invoke("agent:refresh"),
  detectPrinters: () => invoke("agent:detect-printers"),
  selectPrinter: (printerName) => invoke("agent:select-printer", printerName),
  saveMappings: (mappings) => invoke("agent:save-mappings", mappings),
  pauseQueue: () => invoke("agent:pause"),
  resumeQueue: () => invoke("agent:resume"),
  printNow: (printJobId) => invoke("agent:print-now", printJobId),
  cancelPrint: () => invoke("agent:cancel"),
  resolveReviewAsError: () => invoke("agent:resolve-review-error"),
  reprint: (printJobId) => invoke("agent:reprint", printJobId),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("agent:state", listener);
    return () => ipcRenderer.removeListener("agent:state", listener);
  },
}));
