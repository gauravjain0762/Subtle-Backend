const Admin = require("../models/Admin");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const generateAdminToken = require("../utils/generateAdminToken");

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const admin = await Admin.findOne({ email: email.trim().toLowerCase() }).select("+password");

  if (!admin || !(await admin.comparePassword(password))) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = generateAdminToken(admin._id);

  res.status(200).json({
    success: true,
    token,
    admin: { _id: admin._id, email: admin.email, role: admin.role },
  });
});
