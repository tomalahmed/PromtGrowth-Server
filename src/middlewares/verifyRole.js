const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ success: false, message: "Forbidden access" });
    }

    return next();
  };
};

module.exports = verifyRole;