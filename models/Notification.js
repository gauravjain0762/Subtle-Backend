const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["workspace_request", "new_order"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: {
      workspaceRequestId: mongoose.Schema.Types.ObjectId,
      orderId: mongoose.Schema.Types.ObjectId,
      workspaceName: String,
      contactEmail: String,
      orderNumber: String,
      orderTotal: Number,
      planType: String, // "one-time", "weekly", "one-off"
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
