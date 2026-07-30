const express = require("express");
const protect = require("../middleware/auth");
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorited,
} = require("../controllers/favoriteController");

const router = express.Router();

router.use(protect);

router.get("/", getFavorites);
router.post("/", addFavorite);
router.delete("/:dishId", removeFavorite);
router.get("/:dishId/is-favorited", isFavorited);

module.exports = router;
