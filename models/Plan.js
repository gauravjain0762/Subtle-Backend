const mongoose = require("mongoose");

const patternSchema = new mongoose.Schema(
  {
    id: String,
    name: { type: String, required: true },
    days: { type: [String], required: true },
  },
  { _id: false }
);

const planSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["weekly", "one-off"], required: true },
    name: { type: String, required: true },
    description: { type: String },
    pattern: { type: [String], required: true }, // ["Mon", "Tue", "Wed", "Thu", "Fri"] for weekly
    patterns: { type: [patternSchema], default: [] }, // For one-off: [{"Mon", "Wed", "Fri"}, {"Tue", "Thu"}]
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);
