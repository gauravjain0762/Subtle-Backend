const stripe = require("../config/stripe");
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { calculateOrderPricing } = require("../utils/calculateOrderPricing");

const WEEKLY_PLAN = {
  planName: "Weekly Meal Plan",
  pricePerWeek: 47.5,
  pricePerMeal: 9.5,
};

const getOrCreateStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim() || undefined,
    metadata: { userId: user._id.toString() },
  });

  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });

  return customer.id;
};

exports.createOrderPaymentIntent = catchAsync(async (req, res) => {
  const { workspaceCode, deliveryDate, items, promoCode } = req.body || {};

  if (!workspaceCode || !deliveryDate || !Array.isArray(items) || items.length === 0) {
    throw new AppError("Missing required order fields", 400);
  }

  const workspace = await Workspace.findOne({ code: workspaceCode.trim().toUpperCase(), status: "active" });
  if (!workspace) {
    throw new AppError("Workspace code is not active", 400);
  }

  const { total } = await calculateOrderPricing({ workspaceCode, deliveryDate, items, promoCode });

  const amountInPence = Math.round(total * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPence,
    currency: "gbp",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      userId: req.user._id.toString(),
      workspaceCode: workspace.code,
      deliveryDate,
    },
  });

  res.status(200).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: total,
    currency: "gbp",
  });
});

exports.createSetupIntent = catchAsync(async (req, res) => {
  const customerId = await getOrCreateStripeCustomer(req.user);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
  });

  res.status(200).json({
    success: true,
    clientSecret: setupIntent.client_secret,
    customerId,
  });
});

exports.createWeeklySubscription = catchAsync(async (req, res) => {
  const { paymentMethodId } = req.body || {};

  if (!paymentMethodId) {
    throw new AppError("paymentMethodId is required", 400);
  }

  const existing = await Subscription.findOne({ user: req.user._id });
  if (existing && existing.status === "active") {
    throw new AppError("You already have an active subscription", 400);
  }

  const customerId = await getOrCreateStripeCustomer(req.user);

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (paymentMethod.customer !== customerId) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const priceId = process.env.STRIPE_WEEKLY_PRICE_ID;
  if (!priceId) {
    throw new AppError("Weekly plan is not configured", 500);
  }

  const stripeSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    expand: ["latest_invoice.payment_intent"],
  });

  const nextBilling = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000).toISOString().slice(0, 10)
    : undefined;

  const subscription = await Subscription.findOneAndUpdate(
    { user: req.user._id },
    {
      user: req.user._id,
      planType: "weekly",
      planName: WEEKLY_PLAN.planName,
      pricePerWeek: WEEKLY_PLAN.pricePerWeek,
      pricePerMeal: WEEKLY_PLAN.pricePerMeal,
      status: "active",
      startedOn: new Date().toISOString().slice(0, 10),
      nextBilling,
      stripeSubscriptionId: stripeSubscription.id,
      pausedAt: undefined,
    },
    { new: true, upsert: true }
  );

  res.status(201).json({
    success: true,
    subscription,
    stripeStatus: stripeSubscription.status,
  });
});
