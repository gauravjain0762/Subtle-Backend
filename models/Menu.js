const mongoose = require("mongoose");

const daySchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    date: { type: String, required: true },
    theme: { type: String, trim: true },
    closed: { type: Boolean, default: false },
    dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }],
  },
  { _id: false }
);

const menuSchema = new mongoose.Schema(
  {
    weekStart: { type: String, required: true, unique: true },
    weekEnd: { type: String, required: true },
    days: [daySchema],
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Menu", menuSchema);
