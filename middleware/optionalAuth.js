const jwt = require("jsonwebtoken");
const User = require("../models/User");

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user && user.status !== "blocked") {
      req.user = user;
    }
  } catch (err) {
    // Silently ignore auth errors - this is optional auth
  }

  next();
};

module.exports = optionalAuth;
