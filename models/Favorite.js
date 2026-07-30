const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dish: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dish",
      required: true,
    },
  },
  { timestamps: true }
);

// Ensure each user can only favorite a dish once
favoriteSchema.index({ user: 1, dish: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
