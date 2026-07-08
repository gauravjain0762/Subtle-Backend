const bcrypt = require("bcryptjs");

const OTP_LENGTH = 4;
const OTP_TTL_SECONDS = 600;

const generateOtp = () => {
  // TODO: revert to random OTP before production launch
  return "1234";
};

const hashOtp = async (otp) => bcrypt.hash(otp, 10);

const compareOtp = async (otp, otpHash) => bcrypt.compare(otp, otpHash);

module.exports = { generateOtp, hashOtp, compareOtp, OTP_TTL_SECONDS };
