const express = require("express");
const protect = require("../middleware/auth");
const { saveCart, getCart, clearCart } = require("../controllers/cartController");

const router = express.Router();

router.use(protect);

router.put("/", saveCart);
router.get("/", getCart);
router.delete("/", clearCart);

module.exports = router;
