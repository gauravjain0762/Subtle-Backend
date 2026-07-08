const Menu = require("../models/Menu");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

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

  const menu = await Menu.findOneAndUpdate(
    { weekStart },
    { weekStart, weekEnd, days, published: true },
    { new: true, upsert: true, overwrite: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    menu: { _id: menu._id, weekStart: menu.weekStart, published: menu.published },
  });
});
