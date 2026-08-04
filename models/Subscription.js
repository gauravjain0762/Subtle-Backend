const mongoose = require("mongoose");

const billingHistorySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["succeeded", "failed", "pending"], default: "pending" },
    stripeChargeId: { type: String },
    errorMessage: { type: String },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    meal: { type: mongoose.Schema.Types.ObjectId, ref: "Dish", required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    workspaceCode: { type: String, uppercase: true, trim: true },
    workspaceName: { type: String, trim: true },
    mealPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, max: 100 },
    pattern: { type: [String], required: true }, // e.g., ["Mon", "Tue", "Wed", "Thu", "Fri"]
    status: { type: String, enum: ["active", "paused"], default: "active" },
    startDate: { type: Date, required: true },
    nextChargeDate: { type: Date, required: true },
    pausedFrom: { type: Date },
    stripeCustomerId: { type: String },
    totalCharges: { type: Number, default: 0 },
    billingHistory: { type: [billingHistorySchema], default: [] },
    lastOrderGenerationDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
