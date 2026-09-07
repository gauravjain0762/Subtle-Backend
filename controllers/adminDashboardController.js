const Order = require("../models/Order");
const WorkspaceRequest = require("../models/WorkspaceRequest");
const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

// Helper: Get date range based on period
const getDateRange = (period, startDate, endDate) => {
  const now = new Date();
  let start, end;

  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    start = new Date(now.getFullYear(), now.getMonth(), diff);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setDate(end.getDate() + 1);
  } else {
    throw new AppError("Invalid period. Use: today, week, month or provide startDate and endDate", 400);
  }

  return { start, end };
};

exports.getDashboardMetrics = catchAsync(async (req, res) => {
  const { period = "today", startDate, endDate } = req.query;

  // Validate period
  if (!["today", "week", "month"].includes(period) && !(startDate && endDate)) {
    throw new AppError("Invalid period. Use: today, week, month or provide startDate and endDate", 400);
  }

  const { start, end } = getDateRange(period, startDate, endDate);

  // Build date filter for orders
  const dateFilter = {
    createdAt: { $gte: start, $lt: end },
  };

  // 1. Total Orders
  const totalOrders = await Order.countDocuments(dateFilter);

  // 2. Weekly Subscriptions
  const weeklySubscriptions = await Order.countDocuments({
    ...dateFilter,
    planType: "weekly",
  });

  // 3. One-Time Orders
  const onTimeOrders = await Order.countDocuments({
    ...dateFilter,
    planType: "one-time",
  });

  // 4. One-Day Off Plans
  const oneDayOffPlans = await Order.countDocuments({
    ...dateFilter,
    planType: "one-off",
  });

  // 5. Revenue Overview (ONLY delivered orders)
  const deliveredOrders = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lt: end },
        status: "delivered",
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$total" },
      },
    },
  ]);

  const revenue = deliveredOrders.length > 0 ? deliveredOrders[0].totalRevenue : 0;
  const revenueOverview = `£${revenue.toFixed(2)}`;

  // 6. New Company Enquiries (pending workspace requests)
  const newCompanyEnquiries = await WorkspaceRequest.countDocuments({
    status: "pending",
    createdAt: { $gte: start, $lt: end },
  });

  // 7. Total Standard Menu (dishes with menuId: "standard" or no menuId)
  const totalStandardMenu = await Dish.countDocuments({
    $or: [{ menuId: "standard" }, { menuId: { $exists: false } }, { menuId: null }, { menuId: "" }],
  });

  // 8. Total Custom Menu (dishes with menuId that's not standard)
  const totalCustomMenu = await Dish.countDocuments({
    menuId: { $exists: true, $ne: null, $ne: "", $ne: "standard" },
  });

  res.status(200).json({
    success: true,
    data: {
      totalOrders,
      weeklySubscriptions,
      onTimeOrders,
      oneDayOffPlans,
      revenueOverview,
      newCompanyEnquiries,
      totalStandardMenu,
      totalCustomMenu,
    },
  });
});

// Get metrics for multiple periods (for charts/comparison)
exports.getMetricsComparison = catchAsync(async (req, res) => {
  const periods = ["today", "week", "month"];
  const metrics = {};

  for (const period of periods) {
    const { start, end } = getDateRange(period);

    const dateFilter = { createdAt: { $gte: start, $lt: end } };

    const totalOrders = await Order.countDocuments(dateFilter);
    const weeklySubscriptions = await Order.countDocuments({ ...dateFilter, planType: "weekly" });
    const onTimeOrders = await Order.countDocuments({ ...dateFilter, planType: "one-time" });
    const oneDayOffPlans = await Order.countDocuments({ ...dateFilter, planType: "one-off" });

    const deliveredOrders = await Order.aggregate([
      { $match: { ...dateFilter, status: "delivered" } },
      { $group: { _id: null, totalRevenue: { $sum: "$total" } } },
    ]);

    const revenue = deliveredOrders.length > 0 ? deliveredOrders[0].totalRevenue : 0;

    metrics[period] = {
      totalOrders,
      weeklySubscriptions,
      onTimeOrders,
      oneDayOffPlans,
      revenueOverview: `£${revenue.toFixed(2)}`,
    };
  }

  res.status(200).json({
    success: true,
    data: metrics,
  });
});
