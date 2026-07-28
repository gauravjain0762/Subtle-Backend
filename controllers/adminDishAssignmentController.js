const Workspace = require("../models/Workspace");
const Dish = require("../models/Dish");
const DishCompanyAssignment = require("../models/DishCompanyAssignment");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.listCompanies = catchAsync(async (req, res) => {
  const companies = await Workspace.find({ status: "active" }).select("_id name code town city postcode");

  res.status(200).json({ success: true, companies });
});

exports.assignDishToCompanies = catchAsync(async (req, res) => {
  const { dishId } = req.params;
  const { companyIds } = req.body || {};

  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    throw new AppError("companyIds must be a non-empty array", 400);
  }

  const dish = await Dish.findById(dishId);
  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  const companies = await Workspace.find({ _id: { $in: companyIds }, status: "active" });
  if (companies.length !== companyIds.length) {
    throw new AppError("One or more companies not found or inactive", 400);
  }

  const assignments = await Promise.all(
    companyIds.map((companyId) =>
      DishCompanyAssignment.updateOne(
        { dishId, companyId },
        {
          dishId,
          menuId: dish.menuId,
          companyId,
          assignedAt: new Date(),
          assignedBy: req.user?._id,
        },
        { upsert: true }
      )
    )
  );

  const assignedCompanies = await DishCompanyAssignment.find({ dishId }).populate("companyId", "name code");

  res.status(200).json({
    success: true,
    message: `Dish assigned to ${companyIds.length} companies`,
    assignedCompanies,
  });
});

exports.getAssignedCompanies = catchAsync(async (req, res) => {
  const { dishId } = req.params;

  const dish = await Dish.findById(dishId);
  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  const assignments = await DishCompanyAssignment.find({ dishId }).populate("companyId", "_id name code town city postcode");

  res.status(200).json({
    success: true,
    dish: { _id: dish._id, name: dish.name, menuId: dish.menuId },
    assignments,
    total: assignments.length,
  });
});

exports.unassignDishFromCompanies = catchAsync(async (req, res) => {
  const { dishId } = req.params;
  const { companyIds } = req.body || {};

  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    throw new AppError("companyIds must be a non-empty array", 400);
  }

  const dish = await Dish.findById(dishId);
  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  const result = await DishCompanyAssignment.deleteMany({
    dishId,
    companyId: { $in: companyIds },
  });

  const remaining = await DishCompanyAssignment.find({ dishId }).populate("companyId", "name code");

  res.status(200).json({
    success: true,
    message: `Dish unassigned from ${result.deletedCount} companies`,
    remaining,
  });
});
