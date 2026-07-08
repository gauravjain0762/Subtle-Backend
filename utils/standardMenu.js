const Dish = require("../models/Dish");

const WEEKDAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getWeekdayCode = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return WEEKDAY_CODES[date.getDay()];
};

const getStandardDishesForDay = (weekdayCode) =>
  Dish.find({
    available: true,
    availableDays: weekdayCode,
    $or: [{ menuId: "standard" }, { menuId: { $exists: false } }, { menuId: null }, { menuId: "" }],
  });

const toDateStr = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getCurrentWeekMonToFri = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const codes = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return codes.map((weekdayCode, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day: weekdayCode.toUpperCase(), date: toDateStr(d), weekdayCode };
  });
};

module.exports = { getWeekdayCode, getStandardDishesForDay, getCurrentWeekMonToFri, toDateStr };
