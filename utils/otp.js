const bcrypt = require("bcryptjs");

const OTP_LENGTH = 4;
const OTP_TTL_SECONDS = 600;

const generateOtp = () => {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

const hashOtp = async (otp) => bcrypt.hash(otp, 10);

const compareOtp = async (otp, otpHash) => bcrypt.compare(otp, otpHash);

module.exports = { generateOtp, hashOtp, compareOtp, OTP_TTL_SECONDS };
