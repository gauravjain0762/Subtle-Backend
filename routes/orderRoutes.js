const express = require("express");
const { createOrder, getMyOrders, getOrderBySession, createGymBulkOrder } = require("../controllers/orderController");
const protect = require("../middleware/auth");

const router = express.Router();

router.post("/", protect, createOrder);
router.post("/gym-bulk", protect, createGymBulkOrder);
router.get("/my", protect, getMyOrders);
router.get("/by-session/:sessionId", getOrderBySession);

module.exports = router;
