const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    dishId: { type: mongoose.Schema.Types.ObjectId, required: true },
    dishName: { type: String, required: true },
    date: { type: String },
    portionSize: { type: String },
    qty: { type: Number, required: true, min: 1 },
    addons: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    workspaceCode: { type: String, trim: true, uppercase: true },
    deliveryDate: { type: String },
    lunchTime: { type: String },
    isWeeklySubscription: { type: Boolean, default: false },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
