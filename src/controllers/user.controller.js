const mongoose = require("mongoose");
const User = require("../models/User.model");
const Prompt = require("../models/Prompt.model");
const Review = require("../models/Review.model");
const Bookmark = require("../models/Bookmark.model");
const Payment = require("../models/Payment.model");
const Report = require("../models/Report.model");
const {
  DEMO_EMAILS,
  applyDemoUserFilter,
  getDemoUserIds,
  isDemoEmail,
  isDemoViewer,
} = require("../utils/demoScope");
const escapeRegex = require("../utils/escapeRegex");
const { clampPage, clampLimit } = require("../utils/pagination");

const isValidObjectId = (id) => id && /^[0-9a-fA-F]{24}$/.test(id);

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const [bookmarkCount, reviewCount, promptCount] = await Promise.all([
      Bookmark.countDocuments({ user: user._id }),
      Review.countDocuments({ user: user._id }),
      Prompt.countDocuments({ creator: user._id }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        stats: {
          totalPrompts: promptCount,
          bookmarkCount,
          reviewCount,
          subscription: user.isPremium ? "Premium" : "Free",
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, photoURL } = req.body;
    const updates = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "Name cannot be empty" });
      }
      updates.name = trimmed;
    }

    if (photoURL !== undefined) {
      updates.photoURL = String(photoURL).trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCreatorAnalytics = async (req, res, next) => {
  try {
    const creatorId =
      req.user.role === "admin" && req.query.creatorId
        ? req.query.creatorId
        : req.user.id;

    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ success: false, message: "Invalid creator ID" });
    }

    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);

    const [promptStats, copiesOverTime, promptGrowth, bookmarkStats] = await Promise.all([
      Prompt.aggregate([
        { $match: { creator: creatorObjectId } },
        {
          $group: {
            _id: null,
            totalPrompts: { $sum: 1 },
            totalCopies: { $sum: "$copyCount" },
            totalReviews: { $sum: "$reviewCount" },
          },
        },
      ]),
      Prompt.aggregate([
        { $match: { creator: creatorObjectId } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            copies: { $sum: "$copyCount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Prompt.aggregate([
        { $match: { creator: creatorObjectId } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Bookmark.aggregate([
        {
          $lookup: {
            from: "prompts",
            localField: "prompt",
            foreignField: "_id",
            as: "promptDoc",
          },
        },
        { $unwind: "$promptDoc" },
        { $match: { "promptDoc.creator": creatorObjectId } },
        { $count: "total" },
      ]),
    ]);

    const summary = promptStats[0] || {
      totalPrompts: 0,
      totalCopies: 0,
      totalReviews: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        totalPrompts: summary.totalPrompts,
        totalCopies: summary.totalCopies,
        totalReviews: summary.totalReviews,
        totalBookmarks: bookmarkStats[0]?.total || 0,
        copiesOverTime: copiesOverTime.map((item) => ({
          month: item._id,
          copies: item.copies,
        })),
        promptGrowth: promptGrowth.map((item) => ({
          month: item._id,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminAnalytics = async (req, res, next) => {
  try {
    const demoScope = isDemoViewer(req);
    const userFilter = demoScope ? { email: { $in: DEMO_EMAILS } } : {};
    const demoUserIds = demoScope ? await getDemoUserIds() : [];
    const promptFilter = demoScope ? { creator: { $in: demoUserIds } } : {};
    const demoPromptIds = demoScope
      ? await Prompt.find(promptFilter).distinct("_id")
      : [];
    const reviewFilter = demoScope ? { prompt: { $in: demoPromptIds } } : {};
    const reportFilter = demoScope ? { prompt: { $in: demoPromptIds }, status: "pending" } : { status: "pending" };
    const paymentFilter = demoScope
      ? { status: "paid", email: { $in: DEMO_EMAILS } }
      : { status: "paid" };

    const [userCount, promptCount, reviewCount, copyStats, paymentStats, reportCount] =
      await Promise.all([
        User.countDocuments(userFilter),
        Prompt.countDocuments(promptFilter),
        Review.countDocuments(reviewFilter),
        Prompt.aggregate([
          ...(demoScope ? [{ $match: promptFilter }] : []),
          { $group: { _id: null, totalCopies: { $sum: "$copyCount" } } },
        ]),
        Payment.aggregate([
          { $match: paymentFilter },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              paidCount: { $sum: 1 },
            },
          },
        ]),
        Report.countDocuments(reportFilter),
      ]);

    const promptsByStatus = await Prompt.aggregate([
      ...(demoScope ? [{ $match: promptFilter }] : []),
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const usersByRole = await User.aggregate([
      ...(demoScope ? [{ $match: userFilter }] : []),
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          users: userCount,
          prompts: promptCount,
          reviews: reviewCount,
          copies: copyStats[0]?.totalCopies || 0,
          revenue: paymentStats[0]?.totalRevenue || 0,
          paidPayments: paymentStats[0]?.paidCount || 0,
          pendingReports: reportCount,
        },
        promptsByStatus: promptsByStatus.map((item) => ({
          status: item._id,
          count: item.count,
        })),
        usersByRole: usersByRole.map((item) => ({
          role: item._id,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const role = req.query.role;
    const search = req.query.search?.trim()?.slice(0, 100);

    const filter = await applyDemoUserFilter({}, req);
    if (role) filter.role = role;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      results: users.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: users,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (!["user", "creator", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (String(id) === String(req.user.id) && role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own admin account",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isDemoViewer(req) && !isDemoEmail(user.email)) {
      return res.status(403).json({
        success: false,
        message: "Demo admin can only manage demo accounts",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "User role updated",
      data: updatedUser,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (String(id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isDemoViewer(req) && !isDemoEmail(user.email)) {
      return res.status(403).json({
        success: false,
        message: "Demo admin can only manage demo accounts",
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
