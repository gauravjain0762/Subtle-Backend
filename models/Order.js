const mongoose = require("mongoose");

const addonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, default: 1 },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    dishId: { type: mongoose.Schema.Types.ObjectId, required: true },
    dishName: { type: String, required: true },
    portionSize: { type: String },
    qty: { type: Number, required: true, min: 1 },
    addons: { type: [addonSchema], default: [] },
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
    orderNumber: { type: String, unique: true, sparse: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    workspaceCode: { type: String, required: true, uppercase: true, trim: true },
    workspaceName: { type: String, trim: true },
    deliveryDate: { type: String, required: true },
    lunchTime: { type: String, required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    promoCode: { type: String, uppercase: true, trim: true },
    discount: discountSchema,
    total: { type: Number, required: true },
    planType: { type: String, enum: ["one-time", "weekly", "one-off"], default: "one-time" },
    paymentMethod: { type: String, enum: ["card", "apple_pay", "google_pay", "subscription"], default: "card" },
    paymentIntentId: { type: String },
    checkoutSessionId: { type: String },
    paid: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["new", "delivered", "cancelled"],
      default: "new",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
