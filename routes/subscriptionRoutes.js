const express = require("express");
const protect = require("../middleware/auth");
const {
  getAvailablePlans,
  selectPlan,
  checkout,
  verifyCheckoutSession,
  getMySubscription,
  getUpcomingOrders,
  updateSubscription,
  pauseSubscription,
  resumeSubscription,
} = require("../controllers/userSubscriptionsController");

const router = express.Router();

router.get("/available-plans", getAvailablePlans);

router.use(protect);

router.post("/select-plan", selectPlan);
router.post("/checkout", checkout);
router.get("/verify-checkout", verifyCheckoutSession);
router.get("/my-plan", getMySubscription);
router.get("/upcoming-orders", getUpcomingOrders);
router.patch("/my", updateSubscription);  // ← New unified endpoint
router.post("/pause", pauseSubscription);  // ← Legacy endpoint
router.post("/resume", resumeSubscription);  // ← Legacy endpoint

module.exports = router;
