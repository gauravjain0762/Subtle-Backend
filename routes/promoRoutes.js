const express = require("express");
const { validatePromo } = require("../controllers/promoController");

const router = express.Router();

router.post("/validate", validatePromo);

module.exports = router;
