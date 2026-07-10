const mongoose = require("mongoose");

const workspaceRequestSchema = new mongoose.Schema(
  {
    referenceId: { type: String, required: true, unique: true },
    workspace: {
      name: { type: String, required: true, trim: true },
      address1: { type: String, required: true, trim: true },
      town: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      county: { type: String, trim: true },
      postcode: { type: String, required: true, trim: true, uppercase: true },
      country: { type: String, required: true, trim: true },
      deliveryTimes: [{ type: String }],
      employees: { type: String, trim: true },
      premiseType: { type: String, trim: true },
    },
    contact: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkspaceRequest", workspaceRequestSchema);
