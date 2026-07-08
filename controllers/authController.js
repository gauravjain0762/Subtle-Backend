const User = require("../models/User");
const Otp = require("../models/Otp");
const Workspace = require("../models/Workspace");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { isValidEmail } = require("../utils/validators");
const { generateOtp, hashOtp, compareOtp, OTP_TTL_SECONDS } = require("../utils/otp");
const generateToken = require("../utils/generateToken");
const { sendOtpEmail } = require("../services/emailService");

exports.register = catchAsync(async (req, res) => {
  const { firstName, lastName, email, workspaceCode } = req.body || {};

  if (!firstName || !lastName || !isValidEmail(email) || !workspaceCode) {
    throw new AppError("firstName, lastName, email and workspaceCode are required", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const workspace = await Workspace.findOne({
    code: workspaceCode.trim().toUpperCase(),
    status: "active",
  });
  if (!workspace) {
    throw new AppError("Invalid or inactive workspace code", 400);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError("Email already registered", 400);
  }

  await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    workspaceCode: workspace.code,
    workspaceName: workspace.name,
  });

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await Otp.deleteMany({ email: normalizedEmail });
  await Otp.create({ email: normalizedEmail, otpHash, expiresAt });

  await sendOtpEmail(normalizedEmail, otp);

  res.status(200).json({
    success: true,
    message: "OTP sent",
  });
});

exports.sendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    throw new AppError("Invalid email address", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await Otp.deleteMany({ email: normalizedEmail });
  await Otp.create({ email: normalizedEmail, otpHash, expiresAt });

  await sendOtpEmail(normalizedEmail, otp);

  res.status(200).json({
    success: true,
    message: `OTP sent to ${normalizedEmail}`,
    expiresIn: OTP_TTL_SECONDS,
  });
});

exports.verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!isValidEmail(email) || !otp) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError("No account found. Please sign up first.", 401);
  }

  const otpDoc = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

  if (!otpDoc || otpDoc.expiresAt < new Date()) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  const isMatch = await compareOtp(String(otp), otpDoc.otpHash);
  if (!isMatch) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  await Otp.deleteMany({ email: normalizedEmail });

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token,
    user,
  });
});

exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});
