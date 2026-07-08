const express = require("express");
const { getCurrentMenu } = require("../controllers/menuController");

const router = express.Router();

router.get("/current", getCurrentMenu);

module.exports = router;
