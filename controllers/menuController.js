const catchAsync = require("../utils/catchAsync");
const { getCurrentWeekMonToFri, getStandardDishesForDay } = require("../utils/standardMenu");

exports.getCurrentMenu = catchAsync(async (req, res) => {
  const weekDays = getCurrentWeekMonToFri();

  const days = await Promise.all(
    weekDays.map(async ({ day, date, weekdayCode }) => {
      const dishes = await getStandardDishesForDay(weekdayCode);
      return { day, date, theme: "", closed: false, dishes };
    })
  );

  res.status(200).json({
    success: true,
    weekStart: weekDays[0].date,
    weekEnd: weekDays[weekDays.length - 1].date,
    days,
  });
});
