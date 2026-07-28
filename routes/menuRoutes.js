const express = require("express");
const optionalAuth = require("../middleware/optionalAuth");
const { getCurrentMenu } = require("../controllers/menuController");

const router = express.Router();

router.get("/current", optionalAuth, getCurrentMenu);

module.exports = router;
