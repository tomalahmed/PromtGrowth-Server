const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const User = require("../models/User.model");
const generateToken = require("../utils/generateToken");
const { verifyFirebaseIdToken, getGoogleSyncErrorMessage } = require("../config/firebaseAdmin");
const { assertDemoLoginAllowed } = require("../utils/demoScope");

const buildCookieOptions = (req) => {
  const sameSite = process.env.COOKIE_SAME_SITE || "lax";

  let secure = false;
  if (process.env.COOKIE_SECURE === "true") {
    secure = true;
  } else if (process.env.COOKIE_SECURE !== "false") {
    const forwardedProto = req?.headers?.["x-forwarded-proto"];
    if (forwardedProto) {
      secure = forwardedProto.split(",")[0].trim() === "https";
    } else {
      secure = Boolean(req?.secure);
    }
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const sendAuthResponse = (req, res, user, statusCode = 200) => {
  const token = generateToken({
    id: user._id,
    email: user.email,
    role: user.role,
  });

  const userResponse = user.toObject ? user.toObject() : user;
  delete userResponse.password;

  return res
    .status(statusCode)
    .cookie("token", token, buildCookieOptions(req))
    .json({
      success: true,
      message: "Authentication successful",
      data: userResponse,
    });
};

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { name, email, password, photoURL } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      photoURL: photoURL?.trim() || "",
      role: "user",
    });

    return sendAuthResponse(req, res, user, 201);
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    assertDemoLoginAllowed(normalizedEmail);

    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    user.password = undefined;
    return sendAuthResponse(req, res, user);
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res) => {
  return res
    .clearCookie("token", buildCookieOptions(req))
    .status(200)
    .json({
      success: true,
      message: "Logged out successfully",
    });
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

const googleSync = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { idToken } = req.body;

    let decoded;

    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (error) {
      const statusCode = error.statusCode || 401;
      console.error("[google-sync] Token verification failed:", error.message);

      return res.status(statusCode).json({
        success: false,
        message: getGoogleSyncErrorMessage(error),
      });
    }

    const normalizedEmail = (decoded.email || "").trim().toLowerCase();
    const firebaseUid = decoded.uid;

    if (!normalizedEmail || !firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Google account must include email and uid",
      });
    }

    assertDemoLoginAllowed(normalizedEmail);

    const updateFields = {
      name: (decoded.name || "User").trim(),
      email: normalizedEmail,
      photoURL: decoded.picture || "",
      firebaseUid,
    };

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: updateFields,
        $setOnInsert: {
          role: "user",
          isPremium: false,
          promptCount: 0,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    return sendAuthResponse(req, res, user, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  googleSync,
  buildCookieOptions,
};