const express = require("express");
const { createOrder, getMyOrders, getOrderBySession } = require("../controllers/orderController");
const protect = require("../middleware/auth");

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.get("/by-session/:sessionId", protect, getOrderBySession);

module.exports = router;
