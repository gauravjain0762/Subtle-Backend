const RecurringOrder = require("../models/RecurringOrder");
const Subscription = require("../models/Subscription");
const Order = require("../models/Order");
const { getStripe } = require("../config/stripe");
const { calculateOrderPricing } = require("../utils/calculateOrderPricing");

// JOB 1: Generate recurring orders for next week (runs every Sunday 8 PM)
exports.generateWeeklyRecurringOrders = async () => {
  try {
    console.log("🔄 Generating recurring orders for next week...");

    const subscriptions = await Subscription.find({ status: "active" });

    const nextMonday = new Date();
    const day = nextMonday.getDay();
    const daysUntilMonday = (1 - day + 7) % 7 || 7;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);

    for (const subscription of subscriptions) {
      const recurringOrders = [];
      const selectedDays = subscription.selectedDays;

      for (let week = 0; week < 4; week++) {
        selectedDays.forEach((day) => {
          const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(day);
          const orderDate = new Date(nextMonday);
          orderDate.setDate(nextMonday.getDate() + week * 7 + dayIndex);

          // Check if order already exists
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

      // Bulk insert
      if (recurringOrders.length > 0) {
        await RecurringOrder.insertMany(recurringOrders, { ordered: false }).catch(
          (err) => {
            // Ignore duplicate errors
            if (err.code !== 11000) throw err;
          }
        );
      }
    }

    console.log("✅ Recurring orders generated successfully");
  } catch (error) {
    console.error("❌ Error generating recurring orders:", error.message);
  }
};

// JOB 2: Create actual orders from scheduled recurring orders (runs daily at 6 AM)
exports.createOrdersFromSchedule = async () => {
  try {
    console.log("🍽️  Creating orders for today...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find all recurring orders scheduled for today
    const todayRecurringOrders = await RecurringOrder.find({
      scheduledDate: { $gte: today, $lt: tomorrow },
      status: "scheduled",
    }).populate("user subscription");

    for (const recurringOrder of todayRecurringOrders) {
      try {
        const { user, subscription } = recurringOrder;

        // Get workspace
        const userDoc = await require("../models/User").findById(user._id);

        // Calculate pricing based on subscription plan
        // For subscriptions, we'll use the stored price
        const order = await Order.create({
          orderRef: `SUB-${recurringOrder._id}`,
          orderNumber: `SUB-${Date.now()}`,
          user: user._id,
          workspace: userDoc.workspace || null,
          workspaceCode: userDoc.workspaceCode,
          workspaceName: userDoc.workspaceName,
          deliveryDate: today.toISOString().slice(0, 10),
          lunchTime: "12:30 PM",
          items: [], // Empty items for subscription orders (user doesn't customize)
          subtotal: subscription.price,
          discount: null,
          total: subscription.price,
          paid: true,
          paymentMethod: "subscription",
        });

        // Link order to recurring order
        recurringOrder.actualOrderId = order._id;
        recurringOrder.status = "created";
        await recurringOrder.save();

        console.log(`✅ Order created for ${user.email} on ${today.toDateString()}`);
      } catch (err) {
        console.error(`❌ Failed to create order: ${err.message}`);
        recurringOrder.status = "cancelled";
        await recurringOrder.save();
      }
    }

    console.log("✅ Daily order creation completed");
  } catch (error) {
    console.error("❌ Error creating orders:", error.message);
  }
};

// JOB 3: Auto-charge subscriptions (runs weekly Monday 1 AM)
exports.chargeSubscriptions = async () => {
  try {
    console.log("💳 Processing weekly subscription charges...");

    const today = new Date();
    const subscriptions = await Subscription.find({
      status: "active",
      nextBillingDate: { $lte: today },
    }).populate("user");

    const stripe = getStripe();

    for (const subscription of subscriptions) {
      try {
        const charge = await stripe.charges.create({
          amount: Math.round(subscription.price * 100),
          currency: "gbp",
          customer: subscription.user.stripeCustomerId || undefined,
          description: `Weekly meal plan - ${subscription.planName}`,
          metadata: {
            subscriptionId: subscription._id.toString(),
            userId: subscription.user._id.toString(),
          },
        });

        // Record billing history
        subscription.billingHistory.push({
          date: new Date(),
          amount: subscription.price,
          status: "succeeded",
          stripeChargeId: charge.id,
        });

        subscription.totalCharges += 1;
        subscription.nextBillingDate = new Date(subscription.nextBillingDate);
        subscription.nextBillingDate.setDate(subscription.nextBillingDate.getDate() + 7);

        await subscription.save();

        console.log(`✅ Charged ${subscription.user.email}: £${subscription.price}`);
      } catch (err) {
        console.error(`❌ Failed to charge ${subscription.user.email}: ${err.message}`);

        // Record failed charge
        subscription.billingHistory.push({
          date: new Date(),
          amount: subscription.price,
          status: "failed",
          errorMessage: err.message,
        });

        await subscription.save();
      }
    }

    console.log("✅ Weekly charging completed");
  } catch (error) {
    console.error("❌ Error charging subscriptions:", error.message);
  }
};

// JOB 4: Resume paused subscriptions (runs daily at 1 AM)
exports.resumePausedSubscriptions = async () => {
  try {
    console.log("▶️  Checking for subscriptions to resume...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const resumedCount = await Subscription.updateMany(
      {
        status: "paused",
        pausedFrom: { $lte: today },
      },
      {
        $set: { status: "active", pausedFrom: null },
      }
    );

    if (resumedCount.modifiedCount > 0) {
      console.log(`✅ Resumed ${resumedCount.modifiedCount} subscriptions`);
    }
  } catch (error) {
    console.error("❌ Error resuming subscriptions:", error.message);
  }
};

module.exports = {
  generateWeeklyRecurringOrders,
  createOrdersFromSchedule,
  chargeSubscriptions,
  resumePausedSubscriptions,
};
