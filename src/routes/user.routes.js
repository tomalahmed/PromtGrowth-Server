const express = require("express");
const {
  getProfile,
  updateProfile,
  getCreatorAnalytics,
  getAdminAnalytics,
  getAllUsers,
  updateUserRole,
  deleteUser,
} = require("../controllers/user.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyRole = require("../middlewares/verifyRole");

const router = express.Router();

router.get("/profile", verifyToken, getProfile);
router.patch("/profile", verifyToken, updateProfile);
router.get(
  "/creator/analytics",
  verifyToken,
  verifyRole("creator", "admin"),
  getCreatorAnalytics
);
router.get("/admin/analytics", verifyToken, verifyRole("admin"), getAdminAnalytics);
router.get("/", verifyToken, verifyRole("admin"), getAllUsers);
router.patch("/:id/role", verifyToken, verifyRole("admin"), updateUserRole);
router.delete("/:id", verifyToken, verifyRole("admin"), deleteUser);

module.exports = router;
