const express = require("express");
const { sendOtp, verifyOtp, getMe } = require("../controllers/authController");
const protect = require("../middleware/auth");

const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.get("/me", protect, getMe);

module.exports = router;
