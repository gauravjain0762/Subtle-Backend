const mongoose = require("mongoose");

const recurringOrderSchema = new mongoose.Schema(
  {
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scheduledDate: { type: Date, required: true },
    dayOfWeek: { type: String, required: true },
    status: { type: String, enum: ["scheduled", "created", "delivered", "cancelled"], default: "scheduled" },
    actualOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    price: { type: Number, required: true },
  },
  { timestamps: true }
);

recurringOrderSchema.index({ subscription: 1, scheduledDate: 1 });
recurringOrderSchema.index({ user: 1, status: 1 });
recurringOrderSchema.index({ scheduledDate: 1, status: 1 });

module.exports = mongoose.model("RecurringOrder", recurringOrderSchema);
