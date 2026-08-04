const Subscription = require("../models/Subscription");
const Order = require("../models/Order");
const { generateDailyRef } = require("../utils/generateRef");
const getNextSequence = require("../utils/getNextSequence");

// Helper: Get next N delivery dates for a subscription
const getDeliveryDates = (subscription, daysAhead = 28) => {
  const dates = [];
  const startDate = new Date(subscription.startDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysAhead);

  const WEEKDAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (subscription.plan.type === "weekly") {
    // Weekly: Mon-Fri pattern
    let current = new Date(startDate);
    while (current < endDate) {
      const dayCode = WEEKDAY_CODES[current.getDay()];
      if (subscription.pattern.includes(dayCode)) {
        dates.push(toDateStr(current));
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (subscription.plan.type === "one-off") {
    // One-off: alternate days
    let current = new Date(startDate);
    let dayCount = 0;
    while (current < endDate) {
      const dayCode = WEEKDAY_CODES[current.getDay()];
      // Alternate day pattern: days 0, 2, 4, 6, 8, 10, 12, 14, etc.
      if (dayCount % 2 === 0) {
        // Check if this day is in the selected pattern for one-off
        const selectedPattern = subscription.pattern;
        if (selectedPattern.includes(dayCode)) {
          dates.push(toDateStr(current));
        }
      }
      current.setDate(current.getDate() + 1);
      dayCount++;
    }
  }

  return dates;
};

// Helper: Convert date to YYYY-MM-DD string
const toDateStr = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Helper: Check if date has passed (for cutoff logic)
const isPastCutoff = (deliveryDate) => {
  const CUTOFF_HOUR = 22;
  const [year, month, day] = deliveryDate.split("-").map(Number);
  const cutoff = new Date(year, month - 1, day - 1, CUTOFF_HOUR, 0, 0, 0);
  return new Date() > cutoff;
};

// Main function: Generate orders for all active subscriptions
const generateSubscriptionOrders = async () => {
  try {
    console.log("🔄 Starting subscription order generation...");

    // Find all active subscriptions
    const subscriptions = await Subscription.find({ status: "active" })
      .populate("plan")
      .populate("meal")
      .populate("user", "workspaceCode")
      .populate("workspace");

    console.log(`📦 Found ${subscriptions.length} active subscriptions`);

    let generatedCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptions) {
      try {
        // Check if plan exists (might be deleted)
        if (!subscription.plan) {
          console.log(`⚠️ Sub ${subscription._id}: Plan not found, skipping`);
          errorCount++;
          continue;
        }

        // Get workspace info if not already set
        let workspaceId = subscription.workspace;
        let workspaceCode = subscription.workspaceCode;
        let workspaceName = subscription.workspaceName;

        if (!workspaceCode && subscription.user && subscription.user.workspaceCode) {
          const Workspace = require("../models/Workspace");
          const workspace = await Workspace.findOne({ code: subscription.user.workspaceCode.toUpperCase() });
          if (workspace) {
            workspaceId = workspace._id;
            workspaceCode = workspace.code;
            workspaceName = workspace.name;
          }
        }

        // Skip if no workspace info found
        if (!workspaceCode || !workspaceId) {
          console.log(`⚠️ Sub ${subscription._id}: No workspace info, skipping`);
          errorCount++;
          continue;
        }

        // Get upcoming delivery dates
        const deliveryDates = getDeliveryDates(subscription, 28);

        // Filter out dates that already have orders
        // Check for existing subscription orders by user + meal + deliveryDate
        const existingOrders = await Order.find({
          user: subscription.user._id || subscription.user,
          "items.dishId": subscription.meal._id,
          paymentMethod: "subscription",
          deliveryDate: { $in: deliveryDates },
        }).select("deliveryDate");

        const existingDates = new Set(existingOrders.map((o) => o.deliveryDate));
        const newDates = deliveryDates.filter((d) => !existingDates.has(d));

        // Skip if no new dates to generate
        if (newDates.length === 0) {
          console.log(`✓ Sub ${subscription._id}: No new dates to generate`);
          continue;
        }

        // Create orders for new delivery dates
        for (const deliveryDate of newDates) {
          // Skip past cutoff dates
          if (isPastCutoff(deliveryDate)) {
            console.log(`⏸️ Sub ${subscription._id}: Skipping ${deliveryDate} (past cutoff)`);
            continue;
          }

          try {
            const dateStr = deliveryDate.replace(/-/g, "");
            const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr);
            const orderNumber = `ORD-${await getNextSequence("orderNumber")}`;

            // Calculate meal price with quantity
            const mealPrice = subscription.mealPrice || subscription.meal.price;
            const totalPrice = Number(mealPrice) * subscription.quantity;

            const order = await Order.create({
              orderRef,
              orderNumber,
              user: subscription.user._id || subscription.user,
              subscription: subscription._id,
              workspace: workspaceId,
              workspaceCode: workspaceCode,
              workspaceName: workspaceName,
              deliveryDate,
              lunchTime: "12:00 PM",
              items: [
                {
                  dishId: subscription.meal._id,
                  dishName: subscription.meal.name,
                  portionSize: "Regular",
                  qty: subscription.quantity,
                  addons: [],
                  unitPrice: mealPrice,
                  images: subscription.meal.images || [],
                },
              ],
              subtotal: totalPrice,
              total: totalPrice,
              planType: subscription.plan.type,
              paymentMethod: "subscription",
              paid: true,
              status: "new",
            });

            generatedCount++;
            console.log(`✅ Created order ${orderNumber} for ${deliveryDate}`);
          } catch (error) {
            errorCount++;
            console.error(`❌ Failed to create order for ${deliveryDate}:`, error.message);
          }
        }

        // Update subscription's lastOrderGenerationDate
        subscription.lastOrderGenerationDate = new Date();
        await subscription.save();
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing subscription ${subscription._id}:`, error.message);
      }
    }

    console.log(`✅ Order generation complete: ${generatedCount} created, ${errorCount} errors`);
    return { success: true, generated: generatedCount, errors: errorCount };
  } catch (error) {
    console.error("❌ Fatal error in generateSubscriptionOrders:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { generateSubscriptionOrders };
