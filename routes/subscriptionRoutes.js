const express = require("express");
const { getMySubscription, updateMySubscription } = require("../controllers/subscriptionController");
const protect = require("../middleware/auth");

const router = express.Router();

router.get("/my", protect, getMySubscription);
router.patch("/my", protect, updateMySubscription);

module.exports = router;
