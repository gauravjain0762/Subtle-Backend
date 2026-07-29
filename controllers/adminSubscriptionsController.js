const Subscription = require("../models/Subscription");
const RecurringOrder = require("../models/RecurringOrder");
const Order = require("../models/Order");
const User = require("../models/User");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.listSubscriptions = catchAsync(async (req, res) => {
  const { planType, status, page = 1, limit = 25 } = req.query;
  const filter = {};

  if (planType) filter.planType = planType;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .populate("user", "email firstName lastName workspaceCode workspaceName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Subscription.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    subscriptions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

exports.getSubscriptionDetail = catchAsync(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id).populate(
    "user",
    "email firstName lastName workspaceCode workspaceName workspaceAddress"
  );

  if (!subscription) {
    throw new AppError("Subscription not found", 404);
  }

  const [upcomingOrders, billingHistory] = await Promise.all([
    RecurringOrder.find({
      subscription: subscription._id,
      status: { $in: ["scheduled", "created"] },
    })
      .sort({ scheduledDate: 1 })
      .limit(28),
    subscription.billingHistory.slice(-10).reverse(),
  ]);

  res.status(200).json({
    success: true,
    subscription: subscription.toObject(),
    upcomingOrders,
    billingHistory,
  });
});

exports.listSubscriptionOrders = catchAsync(async (req, res) => {
  const { planType, status, from, to, page = 1, limit = 25 } = req.query;
  const filter = {};

  if (planType) filter.planType = planType;
  if (status) filter.status = status;

  if (from || to) {
    filter.scheduledDate = {};
    if (from) filter.scheduledDate.$gte = new Date(from);
    if (to) filter.scheduledDate.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    RecurringOrder.find(filter)
      .populate("subscription", "planType planName selectedPattern")
      .populate("user", "email firstName workspaceCode")
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    RecurringOrder.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    orders,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

exports.getBillingReport = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {};

  if (from || to) {
    dateFilter.$gte = from ? new Date(from) : new Date("2020-01-01");
    dateFilter.$lte = to ? new Date(to) : new Date();
  }

  const subscriptions = await Subscription.find({
    createdAt: dateFilter,
  });

  let totalRevenue = 0;
  let totalCharges = 0;
  let failedCharges = 0;
  const revenueByPlan = { weekly: 0, "one-off": 0 };

  subscriptions.forEach((sub) => {
    sub.billingHistory.forEach((charge) => {
      if (charge.status === "succeeded") {
        totalRevenue += charge.amount;
        totalCharges++;
        revenueByPlan[sub.planType] += charge.amount;
      } else if (charge.status === "failed") {
        failedCharges++;
      }
    });
  });

  const activeSubs = await Subscription.countDocuments({ status: "active" });
  const pausedSubs = await Subscription.countDocuments({ status: "paused" });

  res.status(200).json({
    success: true,
    report: {
      totalRevenue,
      totalCharges,
      failedCharges,
      activeSubs,
      pausedSubs,
      revenueByPlan,
    },
  });
});
