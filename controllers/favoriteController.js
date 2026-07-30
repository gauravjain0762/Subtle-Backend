const Favorite = require("../models/Favorite");
const Dish = require("../models/Dish");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

// Get all favorited dishes for the user
exports.getFavorites = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const favorites = await Favorite.find({ user: userId })
    .populate({
      path: "dish",
      select: "name description price images category availability",
    })
    .sort({ createdAt: -1 });

  const dishes = favorites.map((fav) => fav.dish);

  res.status(200).json({
    success: true,
    count: dishes.length,
    dishes,
  });
});

// Add dish to favorites
exports.addFavorite = catchAsync(async (req, res) => {
  const { dishId } = req.body;
  const userId = req.user._id;

  if (!dishId) {
    throw new AppError("dishId is required", 400);
  }

  // Check if dish exists
  const dish = await Dish.findById(dishId);
  if (!dish) {
    throw new AppError("Dish not found", 404);
  }

  // Check if already favorited
  const existing = await Favorite.findOne({ user: userId, dish: dishId });
  if (existing) {
    throw new AppError("Already in favorites", 400);
  }

  const favorite = await Favorite.create({
    user: userId,
    dish: dishId,
  });

  await favorite.populate({
    path: "dish",
    select: "name description price images category availability",
  });

  res.status(201).json({
    success: true,
    message: "Added to favorites",
    dish: favorite.dish,
  });
});

// Remove dish from favorites
exports.removeFavorite = catchAsync(async (req, res) => {
  const { dishId } = req.params;
  const userId = req.user._id;

  if (!dishId) {
    throw new AppError("dishId is required", 400);
  }

  const favorite = await Favorite.findOneAndDelete({
    user: userId,
    dish: dishId,
  });

  if (!favorite) {
    throw new AppError("Favorite not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Removed from favorites",
  });
});

// Check if a dish is favorited
exports.isFavorited = catchAsync(async (req, res) => {
  const { dishId } = req.params;
  const userId = req.user._id;

  const favorite = await Favorite.findOne({
    user: userId,
    dish: dishId,
  });

  res.status(200).json({
    success: true,
    isFavorited: !!favorite,
  });
});
