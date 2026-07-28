const mongoose = require("mongoose");

const dishCompanyAssignmentSchema = new mongoose.Schema(
  {
    dishId: { type: mongoose.Schema.Types.ObjectId, ref: "Dish", required: true },
    menuId: { type: String, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

dishCompanyAssignmentSchema.index({ dishId: 1, companyId: 1 }, { unique: true });
dishCompanyAssignmentSchema.index({ menuId: 1, companyId: 1 });

module.exports = mongoose.model("DishCompanyAssignment", dishCompanyAssignmentSchema);
