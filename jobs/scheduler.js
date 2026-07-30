const cron = require("node-cron");
const {
  generateWeeklyRecurringOrders,
  createOrdersFromSchedule,
  chargeSubscriptions,
  resumePausedSubscriptions,
} = require("./subscriptionJobs");

function initializeSchedulers() {
  console.log("⏰ Initializing subscription schedulers...");

  // Run every Sunday at 8 PM (20:00)
  cron.schedule("0 20 * * 0", generateWeeklyRecurringOrders, {
    name: "Generate Weekly Recurring Orders",
  });
  console.log("✓ Scheduler: Generate weekly recurring orders (Sunday 8 PM)");

  // Run every day at 6 AM
  cron.schedule("0 6 * * *", createOrdersFromSchedule, {
    name: "Create Orders From Schedule",
  });
  console.log("✓ Scheduler: Create daily orders (6 AM)");

  // Run every day at 1 AM - Charge subscriptions
  cron.schedule("0 1 * * *", chargeSubscriptions, {
    name: "Charge Subscriptions",
  });
  console.log("✓ Scheduler: Auto-charge subscriptions (Daily 1 AM)");

  // Run every day at 2 AM - Resume paused subscriptions
  cron.schedule("0 2 * * *", resumePausedSubscriptions, {
    name: "Resume Paused Subscriptions",
  });
  console.log("✓ Scheduler: Resume paused subscriptions (Daily 2 AM)");

  console.log("✅ All subscription schedulers initialized");
}

module.exports = { initializeSchedulers };
