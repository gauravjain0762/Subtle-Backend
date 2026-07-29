const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.createPlan = catchAsync(async (req, res) => {
  const { type, name, description, price, deliveryDays, patterns, status } = req.body;

  if (!type || !name || !price) {
    throw new AppError("type, name, and price are required", 400);
  }

  if (!["weekly", "one-off"].includes(type)) {
    throw new AppError("type must be 'weekly' or 'one-off'", 400);
  }

  if (type === "weekly" && (!deliveryDays || deliveryDays.length === 0)) {
    throw new AppError("deliveryDays are required for weekly plans", 400);
  }

  if (type === "one-off" && (!patterns || patterns.length === 0)) {
    throw new AppError("patterns are required for one-off plans", 400);
  }

  const plan = await Plan.create({
    type,
    name,
    description,
    price,
    deliveryDays: type === "weekly" ? deliveryDays : [],
    patterns: type === "one-off" ? patterns : [],
    status: status || "active",
  });

  res.status(201).json({ success: true, plan });
});

exports.listPlans = catchAsync(async (req, res) => {
  const { type, status } = req.query;
  const filter = {};

  if (type) filter.type = type;
  if (status) filter.status = status;

  const plans = await Plan.find(filter).sort({ createdAt: -1 });

  const plansWithCounts = await Promise.all(
    plans.map(async (plan) => {
      const activeSubs = await Subscription.countDocuments({
        plan: plan._id,
        status: "active",
      });
      return { ...plan.toObject(), activeSubs };
    })
  );

  res.status(200).json({ success: true, plans: plansWithCounts });
});

exports.getPlan = catchAsync(async (req, res) => {
  const plan = await Plan.findById(req.params.id);

  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  const activeSubs = await Subscription.countDocuments({
    plan: plan._id,
    status: "active",
  });

  res.status(200).json({
    success: true,
    plan: { ...plan.toObject(), activeSubs },
  });
});

exports.updatePlan = catchAsync(async (req, res) => {
  const { name, description, price, status } = req.body;

  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    {
      ...(name && { name }),
      ...(description && { description }),
      ...(price && { price }),
      ...(status && { status }),
    },
    { new: true, runValidators: true }
  );

  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  res.status(200).json({ success: true, plan });
});

exports.deletePlan = catchAsync(async (req, res) => {
  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    { status: "inactive" },
    { new: true }
  );

  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  res.status(200).json({ success: true, message: "Plan deactivated" });
});
