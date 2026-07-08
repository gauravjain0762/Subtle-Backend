const Menu = require("../models/Menu");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const todayIso = () => new Date().toISOString().slice(0, 10);

exports.getCurrentMenu = catchAsync(async (req, res) => {
  const today = todayIso();

  let menu = await Menu.findOne({ weekStart: { $lte: today }, weekEnd: { $gte: today } });

  if (!menu) {
    menu = await Menu.findOne().sort({ weekStart: -1 });
  }

  if (!menu) {
    throw new AppError("No menu is currently available", 404);
  }

  res.status(200).json({
    success: true,
    weekStart: menu.weekStart,
    weekEnd: menu.weekEnd,
    days: menu.days,
  });
});
