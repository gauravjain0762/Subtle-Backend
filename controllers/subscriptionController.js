const Subscription = require("../models/Subscription");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const stripe = require("../config/stripe");

exports.getMySubscription = catchAsync(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id });

  res.status(200).json({
    success: true,
    subscription: subscription || null,
  });
});

exports.updateMySubscription = catchAsync(async (req, res) => {
  const { action } = req.body || {};

  if (!["pause", "resume"].includes(action)) {
    throw new AppError("Invalid action", 400);
  }

  const subscription = await Subscription.findOne({ user: req.user._id });
  if (!subscription) {
    throw new AppError("Subscription not found", 404);
  }

  if (action === "pause") {
    if (subscription.status === "paused") {
      throw new AppError("Subscription is already paused", 400);
    }
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: { behavior: "void" },
      });
    }
    subscription.status = "paused";
    subscription.pausedAt = new Date();
  } else {
    if (subscription.status === "active") {
      throw new AppError("Subscription is already active", 400);
    }
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: "",
      });
    }
    subscription.status = "active";
    subscription.pausedAt = undefined;
  }

  await subscription.save();

  res.status(200).json({
    success: true,
    subscription,
  });
});
