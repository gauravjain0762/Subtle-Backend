const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (err.errors) {
    return res.status(statusCode).json({ success: false, errors: err.errors });
  }

  if (statusCode >= 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
};

module.exports = errorHandler;
