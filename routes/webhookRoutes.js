const express = require("express");
const { handleStripeWebhook } = require("../controllers/stripeWebhookController");

const router = express.Router();

// Stripe webhook - must be raw body for signature verification
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

module.exports = router;
