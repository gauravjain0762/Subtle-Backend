const jwt = require("jsonwebtoken");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const User = require("../models/User");

const protect = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", 401);
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError("Unauthorized", 401);
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new AppError("Unauthorized", 401);
  }

  if (user.status === "blocked") {
    throw new AppError("Your account has been blocked. Please contact support.", 403);
  }

  req.user = user;
  next();
});

module.exports = protect;
