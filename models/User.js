const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    workspaceCode: { type: String, trim: true, uppercase: true },
    workspaceName: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
