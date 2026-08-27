const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["workspace_request", "new_order", "subscription_cancelled"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: {
      workspaceRequestId: mongoose.Schema.Types.ObjectId,
      orderId: mongoose.Schema.Types.ObjectId,
      subscriptionId: mongoose.Schema.Types.ObjectId,
      userId: mongoose.Schema.Types.ObjectId,
      workspaceName: String,
      contactEmail: String,
      customerName: String,
      orderNumber: String,
      orderTotal: Number,
      planType: String, // "one-time", "weekly", "one-off"
      planName: String,
      totalRevenue: Number,
      subscriptionDuration: Number, // days
      cancelledOrdersCount: Number,
    },
    read: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: true }
);

// Index for faster queries
notificationSchema.index({ read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
