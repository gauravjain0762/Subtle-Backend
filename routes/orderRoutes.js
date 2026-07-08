const express = require("express");
const { createOrder, getMyOrders } = require("../controllers/orderController");
const protect = require("../middleware/auth");

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);

module.exports = router;
