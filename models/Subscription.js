const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    planType: { type: String, required: true },
    planName: { type: String, required: true },
    pricePerWeek: { type: Number, required: true },
    pricePerMeal: { type: Number, required: true },
    activeDays: [{ type: String }],
    status: {
      type: String,
      enum: ["active", "paused", "cancelled"],
      default: "active",
    },
    nextDelivery: { type: String },
    nextBilling: { type: String },
    startedOn: { type: String },
    pausedAt: { type: Date },
    stripeSubscriptionId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
