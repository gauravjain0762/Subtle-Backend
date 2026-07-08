const Cart = require("../models/Cart");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.saveCart = catchAsync(async (req, res) => {
  const { workspaceCode, deliveryDate, lunchTime, isWeeklySubscription, items } = req.body || {};

  if (!Array.isArray(items)) {
    throw new AppError("items must be an array", 400);
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
