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
  const { planId, items, startDate, patternId } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!planId || !items || !Array.isArray(items) || items.length === 0 || !startDate) {
    throw new AppError("Missing required fields: planId, items (array), startDate", 400);
  }

  // Validate each item
  items.forEach((item, index) => {
    if (!item.mealId || !item.mealPrice || !item.quantity) {
      throw new AppError(`Item ${index} missing required fields: mealId, mealPrice, quantity`, 400);
    }
    if (item.quantity < 1 || item.quantity > 100) {
      throw new AppError(`Item ${index} quantity must be between 1 and 100`, 400);
    }
  });

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
    pattern = plan.pattern && plan.pattern.length > 0
      ? plan.pattern
      : ["Mon", "Tue", "Wed", "Thu", "Fri"]; // Fallback for backward compatibility

    if (!pattern || pattern.length === 0) {
      throw new AppError("Weekly plan has no delivery days configured", 400);
    }
  } else if (plan.type === "one-off") {
    if (!patternId) {
      throw new AppError("patternId is required for one-off plans", 400);
    }
    const selectedPattern = plan.patterns.find((p) => p.id === patternId);
    if (!selectedPattern) {
      throw new AppError("Invalid pattern selected", 400);
    }
    pattern = selectedPattern.days;

    if (!pattern || pattern.length === 0) {
      throw new AppError("Selected pattern has no delivery days", 400);
    }
  }

  console.log(`📋 Plan retrieved: type=${plan.type}, pattern=${JSON.stringify(pattern)}`);

  // Parse start date
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);

  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const deliveryDates = [];

  // Generate delivery dates based on items array (one item = one day)
  items.forEach((item, index) => {
    const deliveryDate = new Date(start);
    deliveryDate.setDate(deliveryDate.getDate() + index);

    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][deliveryDate.getDay()];
    deliveryDates.push({
      date: deliveryDate.toISOString().slice(0, 10),
      dayOfWeek: dayOfWeek,
      mealId: item.mealId,
      mealPrice: item.mealPrice,
      quantity: item.quantity,
    });
  });

  console.log(`📅 Delivery dates calculated: ${JSON.stringify(deliveryDates)}`);

  // Calculate total charge (sum of all items)
  const totalCharge = items.reduce((sum, item) => sum + (item.mealPrice * item.quantity), 0);

  console.log(`💰 Charge calculation: £${totalCharge.toFixed(2)} (sum of ${items.length} meals)`);

  if (deliveryDates.length === 0) {
    throw new AppError("No delivery dates generated", 400);
  }

  if (totalCharge < 0.30) {
    throw new AppError(`Charge too low: £${totalCharge}. Minimum charge is £0.30`, 400);
  }

  // Create Stripe Checkout Session
  const stripe = getStripe();

  const baseUrl = process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL || "https://subtlekitchen.co.uk"
    : "http://localhost:3000";

  // Create line items for each meal
  const lineItems = items.map((item, index) => ({
    price_data: {
      currency: "gbp",
      product_data: {
        name: `${plan.name} - Day ${index + 1}`,
        description: `Delivery: ${deliveryDates[index].date}`,
      },
      unit_amount: Math.round(item.mealPrice * 100),
    },
    quantity: item.quantity,
  }));

  // Serialize items array for metadata (Stripe has string limits)
  const itemsJson = JSON.stringify(items);

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    currency: "gbp",
    customer_email: req.user.email,
    line_items: lineItems,
    success_url: `${baseUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/subscription/review?cancelled=true`,
    metadata: {
      planId: planId.toString(),
      userId: req.user._id.toString(),
      startDate: startDate,
      patternId: patternId || "none",
      items: itemsJson,
    },
  });

  console.log(`🔗 Checkout session created: ${checkoutSession.id}`);

  res.status(200).json({
    success: true,
    summary: {
      totalCharge: totalCharge,
    },
    deliveryDates,
    checkoutUrl: checkoutSession.url,
    checkoutSessionId: checkoutSession.id,
  });
});

// Verify Stripe checkout session and create subscription
exports.verifyCheckoutSession = catchAsync(async (req, res) => {
  const { session_id } = req.query;  // ✅ Match URL parameter name
  const userId = req.user._id;

  if (!session_id) {
    throw new AppError("Session ID is required", 400);
  }

  console.log(`🔍 Verifying checkout session: ${session_id}`);

  // Retrieve the checkout session from Stripe
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (!session) {
    throw new AppError("Checkout session not found", 404);
  }

  if (session.payment_status !== "paid") {
    throw new AppError("Payment not completed", 400);
  }

  // Extract metadata
  const { planId, startDate, patternId, items: itemsJson } = session.metadata;
  const items = JSON.parse(itemsJson);

  // Check if user already has an active subscription
  const existingSubscription = await Subscription.findOne({
    user: userId,
    status: "active"
  });

  if (existingSubscription) {
    throw new AppError(
      "You already have an active subscription. Pause or cancel your current subscription to create a new one.",
      400
    );
  }

  // Get plan
  const plan = await Plan.findById(planId);
  if (!plan || plan.status !== "active") {
    throw new AppError("Plan not found or inactive", 400);
  }

  // Determine pattern
  let pattern = [];
  if (plan.type === "weekly") {
    pattern = plan.pattern && plan.pattern.length > 0
      ? plan.pattern
      : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  } else if (plan.type === "one-off") {
    if (!patternId || patternId === "none") {
      throw new AppError("patternId required for one-off plans", 400);
    }
    const selectedPattern = plan.patterns.find((p) => p.id === patternId);
    if (!selectedPattern) {
      throw new AppError("Invalid pattern selected", 400);
    }
    pattern = selectedPattern.days;
  }

  // Calculate next charge date
  const start = new Date(startDate);
  const nextChargeDate = new Date(start);
  nextChargeDate.setDate(nextChargeDate.getDate() + 7);

  // Get workspace info from user
  const Workspace = require("../models/Workspace");
  const User = require("../models/User");
  const user = await User.findById(userId);

  let workspace = null;
  let workspaceCode = null;
  let workspaceName = null;

  if (user && user.workspaceCode) {
    workspace = await Workspace.findOne({ code: user.workspaceCode.toUpperCase() });
    if (workspace) {
      workspaceCode = workspace.code;
      workspaceName = workspace.name;
    }
  }

  // Calculate total charge from items
  const totalCharge = items.reduce((sum, item) => sum + (item.mealPrice * item.quantity), 0);

  // Create subscription
  const subscription = await Subscription.create({
    user: userId,
    plan: planId,
    items: items, // Store all meals
    workspace: workspace ? workspace._id : null,
    workspaceCode: workspaceCode || (user ? user.workspaceCode : null),
    workspaceName: workspaceName,
    pattern,
    status: "active",
    startDate: start,
    nextChargeDate,
    totalCharges: 1,
    billingHistory: [
      {
        date: new Date(),
        amount: totalCharge,
        status: "succeeded",
        stripeChargeId: session.payment_intent,
      },
    ],
  });

  console.log(`✅ Subscription created after checkout: ${subscription._id}`);

  // Immediately generate orders for the new subscription (don't wait for cron)
  try {
    const { generateSubscriptionOrders } = require("../services/subscriptionOrderGenerator");
    console.log(`🚀 Generating orders for new subscription ${subscription._id}...`);
    const result = await generateSubscriptionOrders();
    console.log(`✅ Immediate order generation: ${result.generated} orders created`);
  } catch (error) {
    console.error(`⚠️ Failed to generate orders immediately: ${error.message}`);
    // Don't fail the subscription creation if order generation fails
    // The cron job will catch it later
  }

  res.status(201).json({
    success: true,
    message: "Payment successful! Subscription created.",
    subscription: {
      id: subscription._id,
      planName: plan.name,
      totalCharge: totalCharge,
      items: subscription.items,
      pattern: subscription.pattern,
      status: subscription.status,
      startDate: subscription.startDate,
      nextChargeDate: subscription.nextChargeDate,
    },
  });
});

// Legacy checkout - kept for backward compatibility
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
  const subscription = await Subscription.findOne({ user: req.user._id })
    .populate({
      path: "meal",
      select: "name price description images category"
    })
    .populate({
      path: "plan",
      select: "name type description"
    });

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

// Unified pause/resume endpoint - matches frontend expectations
exports.updateSubscription = catchAsync(async (req, res) => {
  const { action, startDate } = req.body;
  const userId = req.user._id;

  if (!action || !["pause", "resume"].includes(action)) {
    throw new AppError("action must be 'pause' or 'resume'", 400);
  }

  let subscription;

  if (action === "pause") {
    // Pause immediately - no startDate needed
    // User can optionally specify pausedFrom if they want to pause from a future date
    const pauseData = {
      status: "paused"
    };

    if (startDate) {
      pauseData.pausedFrom = new Date(startDate);
    } else {
      pauseData.pausedFrom = new Date(); // Pause from now
    }

    subscription = await Subscription.findOneAndUpdate(
      { user: userId, status: "active" },
      pauseData,
      { new: true }
    ).populate("meal").populate("plan");

    if (!subscription) {
      throw new AppError("No active subscription found", 404);
    }

    console.log(`⏸️ Subscription paused: ${subscription._id}`);
  } else if (action === "resume") {
    subscription = await Subscription.findOneAndUpdate(
      { user: userId, status: "paused" },
      { status: "active", pausedFrom: null },
      { new: true }
    ).populate("meal").populate("plan");

    if (!subscription) {
      throw new AppError("No paused subscription found", 404);
    }

    console.log(`▶️ Subscription resumed: ${subscription._id}`);
  }

  res.status(200).json({
    success: true,
    message: `Subscription ${action}ed successfully`,
    subscription: subscription.toObject(),
  });
});

// Legacy endpoints - kept for backward compatibility
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
