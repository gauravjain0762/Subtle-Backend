const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const uploadImageBuffer = require("../utils/uploadImageBuffer");
const { parseJsonField } = require("../utils/parseFormField");

const STRING_FIELDS = ["name", "price", "description", "category", "menuId"];
const BOOLEAN_FIELDS = ["available", "popular", "vegan"];
const ARRAY_FIELDS = [
  "allergens",
  "tags",
  "ingredients",
  "portions",
  "availableDays",
  "images",
  "nutritionalIngredients",
];

const buildDishData = async (req) => {
  const body = req.body || {};
  const data = {};

  STRING_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
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

exports.getDish = catchAsync(async (req, res) => {
  const dish = await Dish.findById(req.params.id);

  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  res.status(200).json({ success: true, dish });
});

exports.setDishAvailability = catchAsync(async (req, res) => {
  const { available } = req.body || {};

  if (typeof available !== "boolean") {
    throw new AppError("available must be true or false", 400);
  }

  const dish = await Dish.findByIdAndUpdate(req.params.id, { available }, { new: true });

  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  res.status(200).json({ success: true, dish });
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

// Check if dish is in use before deletion
exports.checkDishUsage = catchAsync(async (req, res) => {
  const { dishId } = req.params;
  const Order = require("../models/Order");
  const Subscription = require("../models/Subscription");

  // Verify dish exists
  const dish = await Dish.findById(dishId);
  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  // Check orders containing this dish
  const ordersWithDish = await Order.countDocuments({
    "items.dishId": dishId,
  });

  // Check subscriptions using this meal
  const subscriptionsWithDish = await Subscription.countDocuments({
    meal: dishId,
    status: "active",
  });

  // Get unique affected customers
  const affectedOrders = await Order.find(
    { "items.dishId": dishId },
    { user: 1 }
  );
  const affectedSubscriptions = await Subscription.find(
    { meal: dishId, status: "active" },
    { user: 1 }
  );

  const affectedUsers = new Set();
  affectedOrders.forEach((o) => affectedUsers.add(o.user.toString()));
  affectedSubscriptions.forEach((s) => affectedUsers.add(s.user.toString()));
  const affectedCustomers = affectedUsers.size;

  const isInUse = ordersWithDish > 0 || subscriptionsWithDish > 0;

  const message = isInUse
    ? `This dish is being used by ${affectedCustomers} customer${affectedCustomers !== 1 ? "s" : ""}. Deleting it will affect ${ordersWithDish} order${ordersWithDish !== 1 ? "s" : ""} and ${subscriptionsWithDish} subscription${subscriptionsWithDish !== 1 ? "s" : ""}.`
    : null;

  console.log(`🔍 Usage check for dish ${dishId}: ${isInUse ? "IN USE" : "NOT IN USE"}`);

  res.status(200).json({
    success: true,
    isInUse,
    usage: {
      activeOrders: ordersWithDish,
      activeSubscriptions: subscriptionsWithDish,
      affectedCustomers,
    },
    message,
  });
});

exports.deleteDish = catchAsync(async (req, res) => {
  const dish = await Dish.findByIdAndDelete(req.params.id);

  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  console.log(`🗑️ Dish deleted: ${dish.name} (${dish._id})`);

  res.status(200).json({ success: true, message: "Dish deleted successfully" });
});
