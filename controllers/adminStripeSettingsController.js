const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { setStripeMode, getMode } = require("../config/stripe");

exports.getStripeMode = catchAsync(async (req, res) => {
  const mode = getMode();
  const hasTestKeys = !!(process.env.STRIPE_TEST_SECRET_KEY && process.env.STRIPE_TEST_PUBLISHABLE_KEY);
  const hasLiveKeys = !!(process.env.STRIPE_LIVE_SECRET_KEY && process.env.STRIPE_LIVE_PUBLISHABLE_KEY);

  res.status(200).json({
    success: true,
    currentMode: mode,
    available: {
      test: hasTestKeys,
      live: hasLiveKeys,
    },
  });
});

exports.switchStripeMode = catchAsync(async (req, res) => {
  const { mode } = req.body || {};

  if (!mode || !["test", "live"].includes(mode)) {
    throw new AppError("Mode must be 'test' or 'live'", 400);
  }

  const secretKey = mode === "live"
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY;

  const publishableKey = mode === "live"
    ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY
    : process.env.STRIPE_TEST_PUBLISHABLE_KEY;

  if (!secretKey || !publishableKey) {
    throw new AppError(`${mode} mode keys not configured in environment variables`, 400);
  }

  setStripeMode(mode, secretKey, publishableKey);

  res.status(200).json({
    success: true,
    message: `Switched to ${mode} mode`,
    currentMode: mode,
  });
});

exports.configureStripeKeys = catchAsync(async (req, res) => {
  const { mode, secretKey, publishableKey } = req.body || {};

  if (!mode || !secretKey || !publishableKey) {
    throw new AppError("mode, secretKey, and publishableKey are required", 400);
  }

  if (!["test", "live"].includes(mode)) {
    throw new AppError("Mode must be 'test' or 'live'", 400);
  }

  // Validate Stripe keys format
  if (mode === "test" && (!secretKey.startsWith("sk_test_") || !publishableKey.startsWith("pk_test_"))) {
    throw new AppError("Test keys must start with sk_test_ and pk_test_", 400);
  }

  if (mode === "live" && (!secretKey.startsWith("sk_live_") || !publishableKey.startsWith("pk_live_"))) {
    throw new AppError("Live keys must start with sk_live_ and pk_live_", 400);
  }

  // In production, you'd save these to database with encryption
  // For now, we update in-memory config
  setStripeMode(mode, secretKey, publishableKey);

  res.status(200).json({
    success: true,
    message: `${mode} mode keys configured and activated`,
    currentMode: mode,
  });
});
