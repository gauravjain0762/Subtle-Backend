const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const RecurringOrder = require("../models/RecurringOrder");
const { getStripe } = require("../config/stripe");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

// Helper: Get next Monday
function getNextMonday() {
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = (1 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Helper: Generate recurring orders for 4 weeks
async function generateRecurringOrders(subscription, startDate) {
  const days = subscription.selectedDays;
  const recurringOrders = [];

  for (let week = 0; week < 4; week++) {
    days.forEach((day) => {
      const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(day);
      const orderDate = new Date(startDate);
      orderDate.setDate(startDate.getDate() + week * 7 + dayIndex);

      recurringOrders.push({
        subscription: subscription._id,
        user: subscription.user,
        scheduledDate: orderDate,
        dayOfWeek: day,
        status: "scheduled",
        price: subscription.price,
      });
    });
  }

  await RecurringOrder.insertMany(recurringOrders);
}

exports.getAvailablePlans = catchAsync(async (req, res) => {
  const plans = await Plan.find({ status: "active" }).sort({ type: -1 });

  res.status(200).json({ success: true, plans });
});

exports.selectPlan = catchAsync(async (req, res) => {
  const { planId, patternId } = req.body;
  const userId = req.user._id;

  const plan = await Plan.findById(planId);
  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  if (plan.status !== "active") {
    throw new AppError("This plan is no longer available", 400);
  }

  let selectedDays = [];
  let selectedPattern = null;

  if (plan.type === "weekly") {
    selectedDays = plan.deliveryDays;
  } else if (plan.type === "one-off") {
    if (!patternId) {
      throw new AppError("patternId is required for one-off plans", 400);
    }
    const pattern = plan.patterns.find((p) => p.id === patternId);
    if (!pattern) {
      throw new AppError("Invalid pattern selected", 400);
    }
    selectedDays = pattern.days;
    selectedPattern = pattern.name;
  }

  const nextMonday = getNextMonday();
  const nextDeliveryDates = selectedDays.map((day) => {
    const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(day);
    const date = new Date(nextMonday);
    date.setDate(nextMonday.getDate() + dayIndex);
    return { date, dayOfWeek: day };
  });

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(plan.price * 100),
    currency: "gbp",
    automatic_payment_methods: { enabled: true },
  });

  res.status(200).json({
    success: true,
    subscription: {
      planId,
      planType: plan.type,
      planName: plan.name,
      price: plan.price,
      selectedDays,
      selectedPattern,
      nextDeliveries: nextDeliveryDates,
    },
    paymentIntent: {
      clientSecret: paymentIntent.client_secret,
      amount: plan.price,
      currency: "gbp",
    },
  });
});

exports.checkout = catchAsync(async (req, res) => {
  const { planId, patternId, paymentIntentId } = req.body;
  const userId = req.user._id;

  // Check existing subscription
  const existingSub = await Subscription.findOne({ user: userId });
  if (existingSub) {
    throw new AppError("You already have an active subscription", 400);
  }

  // Verify payment
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== "succeeded") {
    throw new AppError("Payment not completed", 400);
  }

  // Get plan
  const plan = await Plan.findById(planId);
  if (!plan || plan.status !== "active") {
    throw new AppError("Plan not found or inactive", 400);
  }

  // Determine selected days
  let selectedDays = [];
  let selectedPattern = null;

  if (plan.type === "weekly") {
    selectedDays = plan.deliveryDays;
  } else {
    const pattern = plan.patterns.find((p) => p.id === patternId);
    if (!pattern) {
      throw new AppError("Invalid pattern", 400);
    }
    selectedDays = pattern.days;
    selectedPattern = pattern.name;
  }

  // Create subscription
  const nextMonday = getNextMonday();
  const nextBillingDate = new Date(nextMonday);
  nextBillingDate.setDate(nextBillingDate.getDate() + 7);

  const subscription = await Subscription.create({
    user: userId,
    plan: planId,
    planType: plan.type,
    planName: plan.name,
    price: plan.price,
    selectedDays,
    selectedPattern,
    status: "active",
    startDate: new Date(),
    nextBillingDate,
    totalCharges: 1,
    billingHistory: [
      {
        date: new Date(),
        amount: plan.price,
        status: "succeeded",
        stripeChargeId: paymentIntent.id,
      },
    ],
  });

  // Generate recurring orders
  await generateRecurringOrders(subscription, nextMonday);

  // Get upcoming orders
  const upcomingOrders = await RecurringOrder.find({
    subscription: subscription._id,
    status: "scheduled",
  })
    .sort({ scheduledDate: 1 })
    .limit(7);

  res.status(201).json({
    success: true,
    subscription: subscription.toObject(),
    upcomingOrders,
  });
});

exports.getMySubscription = catchAsync(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id });

  if (!subscription) {
    return res.status(200).json({ success: true, subscription: null });
  }

  const upcomingOrders = await RecurringOrder.find({
    subscription: subscription._id,
    status: { $in: ["scheduled", "created"] },
  })
    .sort({ scheduledDate: 1 })
    .limit(28);

  const billingHistory = subscription.billingHistory.slice(-10).reverse();

  res.status(200).json({
    success: true,
    subscription: subscription.toObject(),
    upcomingOrders,
    billingHistory,
  });
});

exports.getUpcomingOrders = catchAsync(async (req, res) => {
  const { weeks = 4 } = req.query;

  const subscription = await Subscription.findOne({ user: req.user._id });

  if (!subscription) {
    throw new AppError("No active subscription", 404);
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + weeks * 7);

  const orders = await RecurringOrder.find({
    subscription: subscription._id,
    scheduledDate: { $lte: endDate },
    status: { $in: ["scheduled", "created"] },
  })
    .populate("actualOrderId")
    .sort({ scheduledDate: 1 });

  res.status(200).json({ success: true, orders });
});

exports.pauseSubscription = catchAsync(async (req, res) => {
  const { startDate } = req.body;

  if (!startDate) {
    throw new AppError("startDate is required", 400);
  }

  const subscription = await Subscription.findOneAndUpdate(
    { user: req.user._id, status: "active" },
    { status: "paused", pausedFrom: new Date(startDate) },
    { new: true }
  );

  if (!subscription) {
    throw new AppError("No active subscription found", 404);
  }

  res.status(200).json({
    success: true,
    message: `Subscription paused from ${startDate}`,
    subscription,
  });
});

exports.resumeSubscription = catchAsync(async (req, res) => {
  const subscription = await Subscription.findOneAndUpdate(
    { user: req.user._id, status: "paused" },
    { status: "active", pausedFrom: null },
    { new: true }
  );

  if (!subscription) {
    throw new AppError("No paused subscription found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Subscription resumed",
    subscription,
  });
});
