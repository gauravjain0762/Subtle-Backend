const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    dishId: { type: mongoose.Schema.Types.ObjectId, required: true },
    dishName: { type: String, required: true },
    portionSize: { type: String },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    images: { type: [String], default: [] },
  },
  { _id: false }
);

const discountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["percentage", "fixed"] },
    value: Number,
    amount: Number,
    label: String,
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
    promoCode: { type: String, uppercase: true, trim: true },
    discount: discountSchema,
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
