const mongoose = require("mongoose");
const Menu = require("../models/Menu");
const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

const validateDishIds = async (dishIds) => {
  const invalidIds = dishIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    throw new AppError(`Invalid dish id(s): ${invalidIds.join(", ")}`, 400);
  }

  if (dishIds.length === 0) return;

  const foundCount = await Dish.countDocuments({ _id: { $in: dishIds } });
  if (foundCount !== new Set(dishIds.map(String)).size) {
    throw new AppError("One or more dishIds do not exist", 400);
  }
};

exports.publishMenu = catchAsync(async (req, res) => {
  const { weekStart, weekEnd, days } = req.body || {};

  if (!weekStart || !weekEnd || !Array.isArray(days)) {
    throw new AppError("weekStart, weekEnd and days are required", 400);
  }

  const presentDays = days.map((d) => (d.day || "").toUpperCase());
  const missing = WEEKDAYS.filter((d) => !presentDays.includes(d));
  if (missing.length > 0) {
    throw new AppError(`All weekdays (Mon–Fri) must be included in the menu. Missing: ${missing.join(", ")}`, 400);
  }

  const allDishIds = [...new Set(days.flatMap((d) => (Array.isArray(d.dishes) ? d.dishes : [])))];
  await validateDishIds(allDishIds);

  let menu = await Menu.findOne({ weekStart });
  if (menu) {
    menu.weekEnd = weekEnd;
    menu.days = days;
    menu.published = true;
    await menu.save();
  } else {
    menu = await Menu.create({ weekStart, weekEnd, days, published: true });
  }

  res.status(200).json({
    success: true,
    menu: { _id: menu._id, weekStart: menu.weekStart, published: menu.published },
  });
});

exports.deleteMenu = catchAsync(async (req, res) => {
  const { weekStart } = req.params;

  const menu = await Menu.findOneAndDelete({ weekStart });
  if (!menu) {
    throw new AppError("Menu week not found", 404);
  }

  res.status(200).json({ success: true, message: `Menu week ${weekStart} deleted` });
});

exports.assignDishesToDay = catchAsync(async (req, res) => {
  const { weekStart, day } = req.params;
  const { dishIds } = req.body || {};

  if (!Array.isArray(dishIds)) {
    throw new AppError("dishIds must be an array", 400);
  }

  await validateDishIds(dishIds);

  const menu = await Menu.findOne({ weekStart });
  if (!menu) {
    throw new AppError("Menu week not found", 404);
  }

  const targetDay = menu.days.find((d) => d.day.toUpperCase() === day.toUpperCase());
  if (!targetDay) {
    throw new AppError(`Day ${day} not found in this week's menu`, 404);
  }

  targetDay.dishes = dishIds;
  await menu.save();

  res.status(200).json({
    success: true,
    day: { day: targetDay.day, date: targetDay.date, dishes: targetDay.dishes },
  });
});
