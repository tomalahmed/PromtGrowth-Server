const { isProduction } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (statusCode === 500 && isProduction) {
    message = "Internal server error";
    console.error("[error]", err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;
