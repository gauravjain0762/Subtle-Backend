const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.createPlan = catchAsync(async (req, res) => {
  const { type, name, description, pattern, patterns, status } = req.body;

  if (!type || !name) {
    throw new AppError("type and name are required", 400);
  }

  if (!["weekly", "one-off"].includes(type)) {
    throw new AppError("type must be 'weekly' or 'one-off'", 400);
  }

  if (type === "weekly" && (!pattern || pattern.length === 0)) {
    throw new AppError("pattern array is required for weekly plans (e.g., ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])", 400);
  }

  if (type === "one-off" && (!patterns || patterns.length === 0)) {
    throw new AppError("patterns array is required for one-off plans (e.g., [{id: 'p1', name: 'Mon-Wed-Fri', days: ['Mon', 'Wed', 'Fri']}])", 400);
  }

  const plan = await Plan.create({
    type,
    name,
    description,
    pattern: type === "weekly" ? pattern : [],
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
  const { name, description, status } = req.body;

  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    {
      ...(name && { name }),
      ...(description && { description }),
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
