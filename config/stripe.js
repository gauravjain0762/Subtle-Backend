const Stripe = require("stripe");

const stripeMode = process.env.STRIPE_MODE || "test";

const secretKey = stripeMode === "live"
  ? process.env.STRIPE_LIVE_SECRET_KEY
  : process.env.STRIPE_TEST_SECRET_KEY;

const publishableKey = stripeMode === "live"
  ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY
  : process.env.STRIPE_TEST_PUBLISHABLE_KEY;

if (!secretKey) {
  throw new Error(`Stripe ${stripeMode} secret key not configured`);
}

if (!publishableKey) {
  throw new Error(`Stripe ${stripeMode} publishable key not configured`);
}

const stripe = new Stripe(secretKey, {
  apiVersion: "2023-10-16",
});

module.exports = { stripe, publishableKey, stripeMode };
