const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const ALLOWED_FIELDS = [
  "name",
  "desc",
  "price",
  "largePriceExtra",
  "kcal",
  "protein",
  "carbs",
  "fat",
  "tags",
  "allergens",
  "images",
  "addons",
];

const pickAllowedFields = (body) => {
  const data = {};
  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
};

exports.createDish = catchAsync(async (req, res) => {
  const data = pickAllowedFields(req.body || {});

  if (!data.name || data.price === undefined) {
    throw new AppError("name and price are required", 400);
  }

  const dish = await Dish.create(data);

  res.status(201).json({ success: true, dish });
});

exports.listDishes = catchAsync(async (req, res) => {
  const dishes = await Dish.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, dishes });
});

exports.updateDish = catchAsync(async (req, res) => {
  const data = pickAllowedFields(req.body || {});

  const dish = await Dish.findByIdAndUpdate(req.params.id, data, {
    new: true,
    runValidators: true,
  });

  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  res.status(200).json({ success: true, dish });
});

exports.deleteDish = catchAsync(async (req, res) => {
  const dish = await Dish.findByIdAndDelete(req.params.id);

  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  res.status(200).json({ success: true, message: "Dish deleted" });
});
