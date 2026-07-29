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
    planType: { type: String, enum: ["weekly", "one-off"], required: true },
    planName: { type: String, required: true },
    price: { type: Number, required: true },
    selectedDays: { type: [String], required: true },
    selectedPattern: { type: String },
    status: { type: String, enum: ["active", "paused"], default: "active" },
    startDate: { type: Date, required: true },
    nextBillingDate: { type: Date, required: true },
    pausedFrom: { type: Date },
    stripeSubscriptionId: { type: String },
    totalCharges: { type: Number, default: 0 },
    billingHistory: { type: [billingHistorySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
