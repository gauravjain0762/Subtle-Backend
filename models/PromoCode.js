const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true },
    label: { type: String, trim: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date },
    workspaceCodes: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoCode", promoCodeSchema);
