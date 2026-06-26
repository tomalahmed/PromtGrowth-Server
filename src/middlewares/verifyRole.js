const User = require("../models/User.model");

const verifyRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: "Unauthorized access" });
      }

      const user = await User.findById(req.user.id).select("role");

      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized access" });
      }

      req.user.role = user.role;

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ success: false, message: "Forbidden access" });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = verifyRole;
