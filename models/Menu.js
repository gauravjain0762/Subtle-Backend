const mongoose = require("mongoose");

const addonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const dishSchema = new mongoose.Schema({
  name: { type: String, required: true },
  desc: { type: String, trim: true },
  price: { type: Number, required: true },
  largePriceExtra: { type: Number, default: 0 },
  kcal: Number,
  protein: Number,
  carbs: Number,
  fat: Number,
  tags: [{ type: String }],
  allergens: { type: String, trim: true },
  img: { type: String, trim: true },
  addons: [addonSchema],
});

const daySchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    date: { type: String, required: true },
    theme: { type: String, trim: true },
    closed: { type: Boolean, default: false },
    dishes: [dishSchema],
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
