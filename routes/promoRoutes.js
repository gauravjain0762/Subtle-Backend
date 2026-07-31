const express = require("express");
const protect = require("../middleware/auth");
const { validatePromo, listActivePromoCodes, markPromoAsUsed } = require("../controllers/promoController");

const router = express.Router();

router.get("/", listActivePromoCodes);
router.post("/validate", protect, validatePromo);
router.post("/mark-used", protect, markPromoAsUsed);

module.exports = router;
