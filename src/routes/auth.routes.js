const express = require("express");
const { body } = require("express-validator");

const authController = require("../controllers/auth.controller");
const verifyToken = require("../middlewares/verifyToken");
const { authLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("photoURL").optional({ checkFalsy: true }).isURL().withMessage("PhotoURL must be a valid URL"),
  ],
  authController.register
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  authController.login
);

router.post("/logout", authController.logout);

router.get("/me", verifyToken, authController.getMe);

router.post(
  "/google-sync",
  authLimiter,
  [
    body("idToken").notEmpty().withMessage("idToken is required"),
    body("email").optional().isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("photoURL").optional({ checkFalsy: true }).isURL().withMessage("PhotoURL must be a valid URL"),
  ],
  authController.googleSync
);

module.exports = router;
