const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address1: { type: String, trim: true },
    town: { type: String, trim: true },
    city: { type: String, trim: true },
    county: { type: String, trim: true },
    postcode: { type: String, trim: true, uppercase: true },
    country: { type: String, trim: true },
    deliveryTimes: [{ type: String }],
    employees: { type: String, trim: true },
    premiseType: { type: String, trim: true },
    contact: {
      firstName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Workspace", workspaceSchema);
