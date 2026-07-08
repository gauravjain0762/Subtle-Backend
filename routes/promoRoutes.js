const express = require("express");
const { validatePromo, listActivePromoCodes } = require("../controllers/promoController");

const router = express.Router();

router.get("/", listActivePromoCodes);
router.post("/validate", validatePromo);

module.exports = router;
