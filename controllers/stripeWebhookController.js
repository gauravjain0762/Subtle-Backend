const stripe = require("../config/stripe");
const Order = require("../models/Order");
const Subscription = require("../models/Subscription");

exports.handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[stripeWebhook] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await Order.updateMany({ paymentIntentId: paymentIntent.id }, { paid: true });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;
        const status =
          stripeSub.status === "canceled" ? "cancelled" : stripeSub.status === "active" ? "active" : "paused";
        await Subscription.updateOne({ stripeSubscriptionId: stripeSub.id }, { status });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const periodEnd = invoice.lines?.data?.[0]?.period?.end;
          const nextBilling = periodEnd ? new Date(periodEnd * 1000).toISOString().slice(0, 10) : undefined;
          await Subscription.updateOne(
            { stripeSubscriptionId: invoice.subscription },
            { status: "active", ...(nextBilling ? { nextBilling } : {}) }
          );
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripeWebhook] Failed to process event ${event.type}:`, err.message);
  }

  res.status(200).json({ received: true });
};
