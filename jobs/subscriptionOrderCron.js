const cron = require("node-cron");
const { generateSubscriptionOrders } = require("../services/subscriptionOrderGenerator");

// Run every day at 2:00 AM
const CRON_SCHEDULE = "0 2 * * *";

let cronJob = null;

const startSubscriptionOrderCron = () => {
  try {
    // Don't start if already running
    if (cronJob) {
      console.log("⚠️ Subscription order cron is already running");
      return;
    }

    cronJob = cron.schedule(CRON_SCHEDULE, async () => {
      console.log("\n📅 Running scheduled subscription order generation...");
      try {
        const result = await generateSubscriptionOrders();
        if (!result.success) {
          console.error("❌ Cron job failed:", result.error);
        }
      } catch (error) {
        console.error("❌ Cron job error:", error.message);
      }
    });

    console.log("✅ Subscription order cron job started (runs daily at 2:00 AM UTC)");
  } catch (error) {
    console.error("❌ Failed to start subscription order cron:", error.message);
  }
};

const stopSubscriptionOrderCron = () => {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("⏹️ Subscription order cron job stopped");
  }
};

// Also allow manual trigger for testing
const runSubscriptionOrdersNow = async () => {
  console.log("🚀 Manually triggering subscription order generation...");
  try {
    const result = await generateSubscriptionOrders();
    return result;
  } catch (error) {
    console.error("❌ Manual trigger failed:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  startSubscriptionOrderCron,
  stopSubscriptionOrderCron,
  runSubscriptionOrdersNow,
};
