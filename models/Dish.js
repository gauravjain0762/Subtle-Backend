const mongoose = require("mongoose");

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    gramsPerMeal: Number,
    price: { type: String },
  },
  { _id: false }
);

const portionSchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    price: { type: String, required: true },
  },
  { _id: false }
);

const dishSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: String, required: true },
    description: { type: String, trim: true },
    category: { type: String, trim: true },
    menuId: { type: String, trim: true },
    nutritionalIngredients: { type: [mongoose.Schema.Types.Mixed], default: [] },
    allergens: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    ingredients: [ingredientSchema],
    portions: [portionSchema],
    availableDays: { type: [String], default: [] },
    available: { type: Boolean, default: true },
    popular: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    images: { type: [String], default: [] },
    orders: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dish", dishSchema);
