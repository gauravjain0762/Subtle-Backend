const jwt = require("jsonwebtoken");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const Admin = require("../models/Admin");

const adminProtect = catchAsync(async (req, res, next) => {
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

  if (decoded.role !== "admin") {
    throw new AppError("Unauthorized", 401);
  }

  const admin = await Admin.findById(decoded.id);
  if (!admin) {
    throw new AppError("Unauthorized", 401);
  }

  req.admin = admin;
  next();
});

module.exports = adminProtect;
