const Stripe = require("stripe");

let stripeMode = process.env.STRIPE_MODE || "test";
let secretKey = null;
let publishableKey = null;
let stripe = null;

function initializeStripe() {
  secretKey = stripeMode === "live"
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY;

  publishableKey = stripeMode === "live"
    ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY
    : process.env.STRIPE_TEST_PUBLISHABLE_KEY;

  if (!secretKey) {
    console.warn(`⚠️  Stripe ${stripeMode} secret key not configured. Stripe will not work until configured via admin panel.`);
    return false;
  }

  if (!publishableKey) {
    console.warn(`⚠️  Stripe ${stripeMode} publishable key not configured. Stripe will not work until configured via admin panel.`);
    return false;
  }

  stripe = new Stripe(secretKey, {
    apiVersion: "2023-10-16",
  });

  console.log(`✅ Stripe initialized in ${stripeMode} mode`);
  return true;
}

function setStripeMode(mode, newSecretKey, newPublishableKey) {
  stripeMode = mode;
  secretKey = newSecretKey;
  publishableKey = newPublishableKey;

  if (secretKey) {
    stripe = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
    });
  }
}

function getStripe() {
  if (!stripe) {
    const mode = stripeMode || "test";
    const testKey = process.env.STRIPE_TEST_SECRET_KEY;
    const liveKey = process.env.STRIPE_LIVE_SECRET_KEY;

    throw new Error(
      `Stripe not configured for ${mode} mode. ` +
      `Test key available: ${!!testKey}. ` +
      `Live key available: ${!!liveKey}. ` +
      `Please check environment variables.`
    );
  }
  return stripe;
}

initializeStripe();

module.exports = { getStripe, setStripeMode, getMode: () => stripeMode, publishableKey: () => publishableKey };
