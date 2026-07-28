const catchAsync = require("../utils/catchAsync");
const { getCurrentWeekMonToFri, getStandardDishesForDay } = require("../utils/standardMenu");
const Dish = require("../models/Dish");
const DishCompanyAssignment = require("../models/DishCompanyAssignment");

exports.getCurrentMenu = catchAsync(async (req, res) => {
  const Workspace = require("../models/Workspace");
  const weekDays = getCurrentWeekMonToFri();

  let companyId = null;
  if (req.user && req.user.workspaceCode) {
    const workspace = await Workspace.findOne({ code: req.user.workspaceCode.toUpperCase() });
    if (workspace) {
      companyId = workspace._id;
    }
  }

  const days = await Promise.all(
    weekDays.map(async ({ day, date, weekdayCode }) => {
      let dishes = await getStandardDishesForDay(weekdayCode);

      if (companyId) {
        const customAssignments = await DishCompanyAssignment.find({
          companyId,
          menuId: { $ne: "standard" },
        }).select("dishId");

        const customDishIds = customAssignments.map((a) => a.dishId);

        if (customDishIds.length > 0) {
          const customDishes = await Dish.find({
            _id: { $in: customDishIds },
            available: true,
            availableDays: weekdayCode,
          });

          dishes = [...dishes, ...customDishes];
        }
      }

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
