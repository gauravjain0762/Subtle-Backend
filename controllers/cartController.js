const Cart = require("../models/Cart");
const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { getWeekdayCode } = require("../utils/standardMenu");

exports.saveCart = catchAsync(async (req, res) => {
  const { workspaceCode, deliveryDate, lunchTime, isWeeklySubscription, items } = req.body || {};

  if (!Array.isArray(items)) {
    throw new AppError("items must be an array", 400);
  }

  // Validate that all dishes are available for the selected delivery date
  const weekdayCode = getWeekdayCode(deliveryDate);

  for (const item of items) {
    const dish = await Dish.findById(item.dishId);
    if (!dish) {
      throw new AppError(`Dish not found: ${item.dishId}`, 404);
    }

    if (!dish.available) {
      throw new AppError(`${dish.name} is not available`, 400);
    }

    if (!dish.availableDays || !dish.availableDays.includes(weekdayCode)) {
      throw new AppError(`${dish.name} is not available on ${weekdayCode}`, 400);
    }
  }

  let cart = await Cart.findOne({ user: req.user._id });

  if (cart) {
    cart.workspaceCode = workspaceCode;
    cart.deliveryDate = deliveryDate;
    cart.lunchTime = lunchTime;
    cart.isWeeklySubscription = Boolean(isWeeklySubscription);
    cart.items = items;
    await cart.save();
  } else {
    cart = await Cart.create({
      user: req.user._id,
      workspaceCode,
      deliveryDate,
      lunchTime,
      isWeeklySubscription: Boolean(isWeeklySubscription),
      items,
    });
  }

  res.status(200).json({ success: true, cart });
});

exports.getCart = catchAsync(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  res.status(200).json({ cart: cart || null });
});

exports.clearCart = catchAsync(async (req, res) => {
  await Cart.deleteOne({ user: req.user._id });
  res.status(200).json({ success: true });
});
