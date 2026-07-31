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
    // New fields for one-time use & first-time users
    oneTimeUse: { type: Boolean, default: false },
    firstTimeUserOnly: { type: Boolean, default: false },
    usedBy: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    maxUses: { type: Number }, // Optional: limit total uses
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoCode", promoCodeSchema);
