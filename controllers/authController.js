const User = require("../models/User");
const Workspace = require("../models/Workspace");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { isValidEmail } = require("../utils/validators");
const generateToken = require("../utils/generateToken");

exports.register = catchAsync(async (req, res) => {
  const { firstName, lastName, email, workspaceCode, password, confirmPassword } = req.body || {};

  if (!firstName || !lastName || !isValidEmail(email) || !workspaceCode || !password || !confirmPassword) {
    throw new AppError(
      "firstName, lastName, email, workspaceCode, password and confirmPassword are required",
      400
    );
  }

  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }

  if (password.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
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

  const user = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    password,
    workspaceCode: workspace.code,
    workspaceName: workspace.name,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user,
  });
});

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || !password) {
    throw new AppError("Invalid email or password", 401);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

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
