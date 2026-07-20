const express = require("express");
const protect = require("../middleware/auth");
const {
  createOrderPaymentIntent,
  createSetupIntent,
  createWeeklySubscription,
} = require("../controllers/paymentController");

const router = express.Router();

router.use(protect);

router.post("/create-order-intent", createOrderPaymentIntent);
router.post("/setup-intent", createSetupIntent);
router.post("/subscriptions", createWeeklySubscription);

module.exports = router;
