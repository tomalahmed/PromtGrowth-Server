const Review = require("../models/Review.model");
const Prompt = require("../models/Prompt.model");
const User = require("../models/User.model");
const updatePromptRating = require("../utils/updatePromptRating");
const {
  assertPromptVisibleToViewer,
  getDemoUserIds,
  isDemoViewer,
} = require("../utils/demoScope");
const { clampPage, clampLimit } = require("../utils/pagination");

const isValidObjectId = (id) => id && /^[0-9a-fA-F]{24}$/.test(id);

exports.createReview = async (req, res, next) => {
  try {
    const { promptId } = req.params;
    const { rating, comment } = req.body;

    if (!isValidObjectId(promptId)) {
      return res.status(400).json({ success: false, message: "Invalid prompt ID" });
    }

    const parsedRating = Number(rating);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (!comment || !String(comment).trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    const prompt = await Prompt.findById(promptId);
    if (!prompt) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const canView = await assertPromptVisibleToViewer(req, prompt);
    if (!canView) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const existing = await Review.findOne({
      user: req.user.id,
      prompt: promptId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this prompt",
      });
    }

    if (prompt.visibility === "private") {
      const userDoc = await User.findById(req.user.id);
      const isOwner = String(prompt.creator) === String(req.user.id);
      const isAdmin = req.user.role === "admin";

      if (!isOwner && !isAdmin && (!userDoc || !userDoc.isPremium)) {
        return res.status(403).json({
          success: false,
          message: "Premium access required to review this prompt",
        });
      }
    }

    const review = await Review.create({
      user: req.user.id,
      prompt: promptId,
      rating: parsedRating,
      comment: String(comment).trim(),
    });

    await updatePromptRating(promptId);
    await review.populate("user", "name email photoURL");

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this prompt",
      });
    }
    return next(error);
  }
};

exports.getPromptReviews = async (req, res, next) => {
  try {
    const { promptId } = req.params;
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 5);
    const skip = (page - 1) * limit;

    if (!isValidObjectId(promptId)) {
      return res.status(400).json({ success: false, message: "Invalid prompt ID" });
    }

    const prompt = await Prompt.findById(promptId);
    if (!prompt) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const canView = await assertPromptVisibleToViewer(req, prompt);
    if (!canView) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const [reviews, total] = await Promise.all([
      Review.find({ prompt: promptId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email photoURL"),
      Review.countDocuments({ prompt: promptId }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      results: reviews.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: reviews,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 10);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("prompt", "title category aiTool")
        .populate("user", "name email photoURL"),
      Review.countDocuments({ user: req.user.id }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      results: reviews.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: reviews,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getRecentReviews = async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit, 12);

    let reviewFilter = {};
    if (isDemoViewer(req)) {
      const demoUserIds = await getDemoUserIds();
      const demoPromptIds = await Prompt.find({
        creator: { $in: demoUserIds },
      }).distinct("_id");
      reviewFilter = { prompt: { $in: demoPromptIds } };
    }

    const reviews = await Review.find(reviewFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email photoURL")
      .populate("prompt", "title");

    return res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    return next(error);
  }
};
