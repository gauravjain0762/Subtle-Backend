const mongoose = require("mongoose");

const addonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const dishSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    desc: { type: String, trim: true },
    price: { type: Number, required: true },
    largePriceExtra: { type: Number, default: 0 },
    kcal: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    tags: [{ type: String }],
    allergens: { type: String, trim: true },
    images: { type: [String], default: [] },
    addons: [addonSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dish", dishSchema);
