const mongoose = require("mongoose");

const printJobSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fileName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    pages: {
      type: Number,
      default: 0,
    },

    copies: {
      type: Number,
      default: 1,
    },

    printType: {
      type: String,
      default: "Black & White",
    },

    side: {
      type: String,
      default: "Single Side",
    },

    price: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Printing", "Ready", "Completed"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PrintJob", printJobSchema);