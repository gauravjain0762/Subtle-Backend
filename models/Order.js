const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    dishId: { type: mongoose.Schema.Types.ObjectId, required: true },
    dishName: { type: String, required: true },
    portion: { type: String, enum: ["regular", "large"], default: "regular" },
    qty: { type: Number, required: true, min: 1 },
    addons: [{ type: String }],
    unitPrice: { type: Number, required: true },
    img: { type: String },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderRef: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    workspaceCode: { type: String, required: true, uppercase: true, trim: true },
    deliveryDate: { type: String, required: true },
    lunchTime: { type: String, required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    isWeeklySubscription: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"],
      default: "confirmed",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
