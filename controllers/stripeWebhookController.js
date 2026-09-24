const { getStripe } = require("../config/stripe");
const Order = require("../models/Order");
const Notification = require("../models/Notification");

// Handle Stripe webhooks
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe Webhook received: ${event.type}`);

  try {
    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    }

    // Handle charge.succeeded event
    if (event.type === "charge.succeeded") {
      await handleChargeSucceeded(event.data.object);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`❌ Webhook processing error:`, error.message);
    res.status(200).json({ received: true, error: error.message });
  }
};

// Handle checkout.session.completed event
async function handleCheckoutCompleted(session) {
  try {
    const { id: sessionId, payment_intent, customer_email, metadata } = session;

    console.log(`🔗 Processing checkout.session.completed: ${sessionId}`);

    // Mark order as paid
    if (metadata?.orderId) {
      const order = await Order.findById(metadata.orderId);
      if (order && !order.paid) {
        order.paid = true;
        order.paymentIntentId = payment_intent;
        await order.save();
        console.log(`✅ Order ${order.orderNumber} marked as PAID via webhook`);

        // Create admin notification
        try {
          await Notification.create({
            type: "order_paid",
            title: `Payment Received - ${order.orderNumber}`,
            message: `Payment of £${order.total.toFixed(2)} received for order ${order.orderNumber}`,
            data: {
              orderId: order._id,
              orderNumber: order.orderNumber,
              amount: order.total,
              customerEmail: customer_email,
            },
            read: false,
          });
          console.log(`📢 Admin notification created for ${order.orderNumber}`);
        } catch (notifError) {
          console.error(`⚠️ Failed to create notification:`, notifError.message);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error handling checkout.session.completed:", error.message);
  }
}

// Handle charge.succeeded event
async function handleChargeSucceeded(charge) {
  try {
    const { id: chargeId, amount, customer_email, metadata } = charge;

    console.log(`💳 Processing charge.succeeded: £${(amount / 100).toFixed(2)}`);

    if (metadata?.orderId) {
      const order = await Order.findById(metadata.orderId);
      if (order && !order.paid) {
        order.paid = true;
        await order.save();
        console.log(`✅ Order ${order.orderNumber} marked as PAID (charge: ${chargeId})`);
      }
    }
  } catch (error) {
    console.error("❌ Error handling charge.succeeded:", error.message);
  }
}
