const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const uploadImageBuffer = require("../utils/uploadImageBuffer");
const { parseJsonField } = require("../utils/parseFormField");

const STRING_FIELDS = ["name", "price", "description", "category", "menuId"];
const NUMBER_FIELDS = ["kcal", "protein", "carbs", "fat"];
const BOOLEAN_FIELDS = ["available", "popular", "vegan"];
const ARRAY_FIELDS = ["allergens", "tags", "ingredients", "portions", "availableDays", "images"];

const buildDishData = async (req) => {
  const body = req.body || {};
  const data = {};

  STRING_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });

  NUMBER_FIELDS.forEach((field) => {
    if (body[field] !== undefined && body[field] !== "") {
      const num = Number(body[field]);
      if (Number.isNaN(num)) {
        throw new AppError(`${field} must be a number`, 400);
      }
      data[field] = num;
    }
  });

  BOOLEAN_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      const parsed = parseJsonField(body[field]);
      if (typeof parsed !== "boolean") {
        throw new AppError(`${field} must be true or false`, 400);
      }
      data[field] = parsed;
    }
  });

  ARRAY_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      const parsed = parseJsonField(body[field]);
      if (!Array.isArray(parsed)) {
        throw new AppError(`${field} must be an array`, 400);
      }
      data[field] = parsed;
    }
  });

  const uploadedImages =
    req.files && req.files.length > 0
      ? await Promise.all(req.files.map((file) => uploadImageBuffer(file.buffer)))
      : [];

  if (uploadedImages.length > 0) {
    data.images = [...(data.images || []), ...uploadedImages];
  }

  return data;
};

exports.createDish = catchAsync(async (req, res) => {
  const data = await buildDishData(req);

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
  const data = await buildDishData(req);

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
