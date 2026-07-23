"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PrinterService,
  PrinterError,
} = require("../src/lib/printerService");

test("detectPrinters reports Windows default, offline, and paper-out states", async () => {
  const service = new PrinterService({
    pdfPrinter: {
      getPrinters: async () => ["Ready Printer", "Offline Printer", "Paper Printer"],
      getDefaultPrinter: async () => "Ready Printer",
    },
    powerShellRunner: async (script) => {
      assert.equal(script, "status");
      return [
        {
          Name: "Ready Printer",
          Default: true,
          WorkOffline: false,
          PrinterStatus: 3,
          DetectedErrorState: 2,
        },
        {
          Name: "Offline Printer",
          WorkOffline: true,
          PrinterStatus: 7,
          DetectedErrorState: 9,
        },
        {
          Name: "Paper Printer",
          WorkOffline: false,
          PrinterStatus: 3,
          DetectedErrorState: 4,
        },
      ];
    },
  });

  const printers = await service.detectPrinters();
  assert.equal(printers.find((entry) => entry.name === "Ready Printer").isDefault, true);
  assert.equal(printers.find((entry) => entry.name === "Offline Printer").online, false);
  assert.equal(printers.find((entry) => entry.name === "Paper Printer").paperOut, true);
});

test("printJob waits for the observed Windows spool job to finish", async () => {
  let jobQuery = 0;
  const printCalls = [];
  const service = new PrinterService({
    pdfPrinter: {
      getPrinters: async () => ["Office Printer"],
      getDefaultPrinter: async () => "Office Printer",
      print: async (filePath, options) => printCalls.push({ filePath, options }),
    },
    powerShellRunner: async (script) => {
      if (script === "status") {
        return {
          Name: "Office Printer",
          Default: true,
          WorkOffline: false,
          PrinterStatus: 3,
          DetectedErrorState: 2,
        };
      }
      if (script === "jobs") {
        jobQuery += 1;
        if (jobQuery === 1) return [];
        if (jobQuery === 2) return [{ ID: 71, JobStatus: "Printing" }];
        return [];
      }
      throw new Error(`Unexpected script ${script}`);
    },
  });

  const result = await service.printJob(
    "C:\\Temp\\order.pdf",
    {
      id: "64b000000000000000000001",
      copies: 2,
      paperSize: "A3",
      printType: "Black & White",
      side: "Double",
    },
    {
      selectedPrinter: "Office Printer",
      mappings: {},
      printDefaults: { orientation: "landscape", duplexMode: "duplexlong" },
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.spoolJobIds, [71]);
  assert.equal(printCalls.length, 1);
  assert.deepEqual(printCalls[0].options, {
    printer: "Office Printer",
    copies: 2,
    paperSize: "A3",
    monochrome: true,
    orientation: "landscape",
    side: "duplexlong",
    silent: true,
  });
});

test("offline printer prevents submission", async () => {
  let submitted = false;
  const service = new PrinterService({
    pdfPrinter: {
      getPrinters: async () => ["Offline Printer"],
      getDefaultPrinter: async () => "Offline Printer",
      print: async () => {
        submitted = true;
      },
    },
    powerShellRunner: async () => ({
      Name: "Offline Printer",
      WorkOffline: true,
      PrinterStatus: 7,
      DetectedErrorState: 9,
    }),
  });

  await assert.rejects(
    service.printJob(
      "C:\\Temp\\order.pdf",
      { copies: 1, paperSize: "A4", printType: "Color", side: "Single" },
      { selectedPrinter: "Offline Printer", mappings: {}, printDefaults: {} }
    ),
    (error) =>
      error instanceof PrinterError &&
      error.code === "PRINTER_OFFLINE"
  );
  assert.equal(submitted, false);
});
