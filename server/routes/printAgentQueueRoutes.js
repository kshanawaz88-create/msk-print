const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const PrintJob = require("../models/printJob");
const { protectPrintAgent } = require("../middleware/printAgentAuth");
const printFileService = require("../services/printFileService");

const router = express.Router();
const CLAIM_TOKEN = /^[a-zA-Z0-9_-]{32,128}$/;

const claimHash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const validId = (value) => mongoose.isValidObjectId(value);
const safeReason = (value, fallback) => {
  const reason = typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500)
    : "";
  return reason || fallback;
};
const parseClaim = (req, res) => {
  const token = req.get("x-print-claim") || req.body?.claimToken || "";
  if (!CLAIM_TOKEN.test(token)) {
    res.status(400).json({
      success: false,
      message: "A valid print claim token is required",
    });
    return null;
  }
  return { token, hash: claimHash(token) };
};

const queueDto = (job, agent) => ({
  id: job._id,
  status: job.status,
  paymentStatus: job.paymentStatus,
  customer: job.user?.fullName || "Customer",
  fileName: job.fileName,
  pages: job.pages,
  copies: job.copies,
  paperSize: job.paperSize,
  printType: job.printType,
  side: job.side,
  createdAt: job.createdAt,
  printStartedAt: job.printStartedAt,
  printCompletedAt: job.printCompletedAt,
  errorReason: job.errorReason || "",
  claimable: job.status === "Pending" && !job.printClaimHash,
  claimedByThisAgent:
    Boolean(job.printAgentSessionId) &&
    job.printAgentSessionId === agent.sessionId,
});

const populateQueue = (query) => query.populate("user", "fullName");
const selectQueueInternals = (query) =>
  query.select("+printClaimHash +printAgentSessionId");

router.use(protectPrintAgent);

router.get("/", async (req, res, next) => {
  try {
    const filter = {
      shopId: req.agent.shopId,
      paymentStatus: "Paid",
      status: { $in: ["Pending", "Printing"] },
    };
    const [jobs, waiting, printing, completed, errors] = await Promise.all([
      populateQueue(selectQueueInternals(PrintJob.find(filter)))
        .sort({ createdAt: 1, _id: 1 }),
      PrintJob.countDocuments({
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: "Pending",
      }),
      PrintJob.countDocuments({
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: "Printing",
      }),
      PrintJob.countDocuments({
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: "Completed",
      }),
      PrintJob.countDocuments({
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: "Error",
      }),
    ]);
    return res.json({
      success: true,
      queue: jobs.map((job) => queueDto(job, req.agent)),
      counts: { waiting, printing, completed, errors },
      polledAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const requestedStatus = req.query.status;
    const statuses = ["Completed", "Error", "Cancelled"];
    if (requestedStatus && !statuses.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "History status must be Completed, Error, or Cancelled",
      });
    }
    const jobs = await populateQueue(
      selectQueueInternals(PrintJob.find({
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: requestedStatus || { $in: statuses },
      }))
    )
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit);
    return res.json({
      success: true,
      history: jobs.map((job) => queueDto(job, req.agent)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/claim", async (req, res, next) => {
  try {
    const claim = parseClaim(req, res);
    if (!claim) return;
    const printJobId = req.body.printJobId;
    if (printJobId !== undefined && !validId(printJobId)) {
      return res.status(400).json({ success: false, message: "Invalid print job ID" });
    }

    const filter = {
      ...(printJobId ? { _id: printJobId } : {}),
      shopId: req.agent.shopId,
      paymentStatus: "Paid",
      status: "Pending",
      printClaimHash: { $in: ["", null] },
    };
    const claimed = await populateQueue(
      selectQueueInternals(PrintJob.findOneAndUpdate(
        filter,
        {
          $set: {
            printClaimHash: claim.hash,
            printAgentSessionId: req.agent.sessionId,
            printClaimedAt: new Date(),
            printStartedAt: null,
            printCompletedAt: null,
            errorReason: "",
          },
          $inc: { printAttemptCount: 1 },
        },
        {
          returnDocument: "after",
          runValidators: true,
          sort: { createdAt: 1, _id: 1 },
        }
      ))
    );
    if (claimed) {
      return res.json({
        success: true,
        message: "Print order claimed",
        job: queueDto(claimed, req.agent),
      });
    }

    if (printJobId) {
      const existing = await populateQueue(
        selectQueueInternals(PrintJob.findOne({
          _id: printJobId,
          shopId: req.agent.shopId,
          paymentStatus: "Paid",
        }))
      );
      if (
        existing?.status === "Pending" &&
        existing.printClaimHash === claim.hash
      ) {
        return res.json({
          success: true,
          message: "Print order was already claimed",
          job: queueDto(existing, req.agent),
        });
      }
    }
    return res.status(409).json({
      success: false,
      message: "No claimable print order is available",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reprint", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid print job ID" });
    }
    const claim = parseClaim(req, res);
    if (!claim) return;
    const job = await populateQueue(
      selectQueueInternals(PrintJob.findOneAndUpdate(
        {
          _id: req.params.id,
          shopId: req.agent.shopId,
          paymentStatus: "Paid",
          status: { $in: ["Completed", "Error", "Cancelled"] },
        },
        {
          $set: {
            status: "Pending",
            printClaimHash: claim.hash,
            printAgentSessionId: req.agent.sessionId,
            printClaimedAt: new Date(),
            printStartedAt: null,
            printCompletedAt: null,
            errorReason: "",
          },
          $inc: { printAttemptCount: 1 },
        },
        { returnDocument: "after", runValidators: true }
      ))
    );
    if (!job) {
      return res.status(409).json({
        success: false,
        message: "Only completed, cancelled, or failed paid orders can be reprinted",
      });
    }
    return res.json({
      success: true,
      message: "Reprint claimed",
      job: queueDto(job, req.agent),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/started", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid print job ID" });
    }
    const claim = parseClaim(req, res);
    if (!claim) return;
    const job = await populateQueue(
      selectQueueInternals(PrintJob.findOneAndUpdate(
        {
          _id: req.params.id,
          shopId: req.agent.shopId,
          paymentStatus: "Paid",
          status: "Pending",
          printClaimHash: claim.hash,
        },
        {
          $set: {
            status: "Printing",
            printStartedAt: new Date(),
            printCompletedAt: null,
            errorReason: "",
          },
        },
        { returnDocument: "after", runValidators: true }
      ))
    );
    if (job) {
      return res.json({
        success: true,
        message: "Print started",
        job: queueDto(job, req.agent),
      });
    }
    const existing = await selectQueueInternals(PrintJob.findOne({
      _id: req.params.id,
      shopId: req.agent.shopId,
      paymentStatus: "Paid",
      printClaimHash: claim.hash,
    }));
    if (existing?.status === "Printing") {
      return res.json({ success: true, message: "Print was already started" });
    }
    return res.status(409).json({
      success: false,
      message: "Print claim is no longer valid",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/file", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid print job ID" });
    }
    const claim = parseClaim(req, res);
    if (!claim) return;
    const job = await PrintJob.findOne({
      _id: req.params.id,
      shopId: req.agent.shopId,
      paymentStatus: "Paid",
      status: { $in: ["Pending", "Printing"] },
      printClaimHash: claim.hash,
    }).select(
      "+printClaimHash +cloudinaryPublicId +cloudinaryDeliveryType +fileMimeType +fileSize"
    );
    if (!job) {
      return res.status(403).json({
        success: false,
        message: "The print file is not available for this agent claim",
      });
    }
    await printFileService.streamPrintFile(job, res);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    next(error);
  }
});

const finalize = (status) => async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid print job ID" });
    }
    const claim = parseClaim(req, res);
    if (!claim) return;
    const update = status === "Completed"
      ? {
          status,
          printCompletedAt: new Date(),
          errorReason: "",
          printerName: safeReason(req.body.printerName, "").slice(0, 100),
        }
      : status === "Cancelled"
      ? {
          status,
          printCompletedAt: null,
          errorReason: "Print cancelled by operator",
        }
      : {
          status: "Error",
          printCompletedAt: null,
          errorReason: safeReason(req.body.errorReason, "Print failed"),
        };
    const allowedCurrentStatuses = status === "Completed"
      ? ["Printing"]
      : ["Pending", "Printing"];
    const job = await PrintJob.findOneAndUpdate(
      {
        _id: req.params.id,
        shopId: req.agent.shopId,
        paymentStatus: "Paid",
        status: { $in: allowedCurrentStatuses },
        printClaimHash: claim.hash,
      },
      { $set: update },
      { returnDocument: "after", runValidators: true }
    );
    if (job) {
      return res.json({
        success: true,
        message: status === "Completed"
          ? "Print completed"
          : status === "Cancelled"
          ? "Print cancelled"
          : "Print failure recorded",
        job: queueDto(job, req.agent),
      });
    }

    const existing = await selectQueueInternals(PrintJob.findOne({
      _id: req.params.id,
      shopId: req.agent.shopId,
      paymentStatus: "Paid",
      printClaimHash: claim.hash,
    }));
    if (existing?.status === status) {
      return res.json({
        success: true,
        message: `Print was already ${status.toLowerCase()}`,
      });
    }
    return res.status(409).json({
      success: false,
      message: "Print claim is no longer valid",
    });
  } catch (error) {
    next(error);
  }
};

router.post("/:id/complete", finalize("Completed"));
router.post("/:id/error", finalize("Error"));
router.post("/:id/cancel", finalize("Cancelled"));

module.exports = router;
