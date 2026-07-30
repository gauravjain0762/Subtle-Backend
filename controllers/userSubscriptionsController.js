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
  const { planId, mealId, mealPrice, quantity, startDate, patternId } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!planId || !mealId || !mealPrice || !quantity || !startDate) {
    throw new AppError("Missing required fields: planId, mealId, mealPrice, quantity, startDate", 400);
  }

  // Validate quantity
  if (quantity < 1 || quantity > 100) {
    throw new AppError("Quantity must be between 1 and 100", 400);
  }

  // Get plan
  const plan = await Plan.findById(planId);
  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  if (plan.status !== "active") {
    throw new AppError("This plan is no longer available", 400);
  }

  // Determine pattern based on plan type
  let pattern = [];
  if (plan.type === "weekly") {
    pattern = plan.pattern; // e.g., ["Mon", "Tue", "Wed", "Thu", "Fri"]
  } else if (plan.type === "one-off") {
    if (!patternId) {
      throw new AppError("patternId is required for one-off plans", 400);
    }
    const selectedPattern = plan.patterns.find((p) => p.id === patternId);
    if (!selectedPattern) {
      throw new AppError("Invalid pattern selected", 400);
    }
    pattern = selectedPattern.days;
  }

  // Calculate delivery dates from startDate
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const deliveryDates = [];
  const dayIndices = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  // For this week (from startDate)
  pattern.forEach((day) => {
    const dayIndex = dayIndices.indexOf(day);
    const date = new Date(start);
    const startDayIndex = start.getDay() === 0 ? 6 : start.getDay() - 1; // Convert to Mon=0
    const daysToAdd = dayIndex - startDayIndex;

    if (daysToAdd >= 0) {
      date.setDate(date.getDate() + daysToAdd);
      deliveryDates.push({
        date: date.toISOString().slice(0, 10),
        dayOfWeek: day,
      });
    }
  });

  // Calculate total charge
  const numDeliveryDays = deliveryDates.length;
  const totalCharge = mealPrice * quantity * numDeliveryDays;

  // Create Stripe payment intent
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalCharge * 100),
    currency: "gbp",
    automatic_payment_methods: { enabled: true },
    metadata: {
      planId: planId.toString(),
      mealId: mealId.toString(),
      userId: userId.toString(),
    },
  });

  res.status(200).json({
    success: true,
    deliveryDates,
    summary: {
      planType: plan.type,
      planName: plan.name,
      mealPrice: mealPrice,
      quantity: quantity,
      numDeliveryDays: numDeliveryDays,
      totalCharge: totalCharge,
      pattern: pattern,
    },
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
  });
});

exports.checkout = catchAsync(async (req, res) => {
  const { planId, mealId, mealPrice, quantity, startDate, patternId, paymentIntentId } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!planId || !mealId || !mealPrice || !quantity || !startDate || !paymentIntentId) {
    throw new AppError("Missing required fields", 400);
  }

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

  // Determine pattern
  let pattern = [];
  if (plan.type === "weekly") {
    pattern = plan.pattern;
  } else {
    if (!patternId) {
      throw new AppError("patternId required for one-off plans", 400);
    }
    const selectedPattern = plan.patterns.find((p) => p.id === patternId);
    if (!selectedPattern) {
      throw new AppError("Invalid pattern selected", 400);
    }
    pattern = selectedPattern.days;
  }

  // Calculate next charge date (next week same pattern)
  const start = new Date(startDate);
  const nextChargeDate = new Date(start);
  nextChargeDate.setDate(nextChargeDate.getDate() + 7);

  // Create subscription
  const subscription = await Subscription.create({
    user: userId,
    plan: planId,
    meal: mealId,
    mealPrice,
    quantity,
    pattern,
    status: "active",
    startDate: start,
    nextChargeDate,
    totalCharges: 1,
    billingHistory: [
      {
        date: new Date(),
        amount: mealPrice * quantity * pattern.length,
        status: "succeeded",
        stripeChargeId: paymentIntent.id,
      },
    ],
  });

  // Create orders for each delivery date this week
  const Order = require("../models/Order");
  const dayIndices = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const deliveryOrders = [];

  pattern.forEach((day) => {
    const dayIndex = dayIndices.indexOf(day);
    const deliveryDate = new Date(start);
    const startDayIndex = start.getDay() === 0 ? 6 : start.getDay() - 1;
    const daysToAdd = dayIndex - startDayIndex;

    if (daysToAdd >= 0) {
      deliveryDate.setDate(deliveryDate.getDate() + daysToAdd);
      deliveryOrders.push({
        scheduledDate: deliveryDate,
        dayOfWeek: day,
      });
    }
  });

  res.status(201).json({
    success: true,
    message: "Subscription created successfully",
    subscription: {
      _id: subscription._id,
      meal: subscription.meal,
      mealPrice: subscription.mealPrice,
      quantity: subscription.quantity,
      pattern: subscription.pattern,
      status: subscription.status,
      startDate: subscription.startDate,
      nextChargeDate: subscription.nextChargeDate,
      deliveryOrders: deliveryOrders.map((o) => ({
        date: o.scheduledDate.toISOString().slice(0, 10),
        dayOfWeek: o.dayOfWeek,
      })),
    },
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
