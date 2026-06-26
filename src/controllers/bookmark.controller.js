const Bookmark = require("../models/Bookmark.model");
const Prompt = require("../models/Prompt.model");
const User = require("../models/User.model");
const {
  sanitizePromptsForViewer,
  enrichViewerFromRequest,
} = require("../utils/promptVisibility");

const isValidObjectId = (id) => id && /^[0-9a-fA-F]{24}$/.test(id);

exports.toggleBookmark = async (req, res, next) => {
  try {
    const { promptId } = req.params;

    if (!isValidObjectId(promptId)) {
      return res.status(400).json({ success: false, message: "Invalid prompt ID" });
    }

    const prompt = await Prompt.findById(promptId);
    if (!prompt) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const existing = await Bookmark.findOne({
      user: req.user.id,
      prompt: promptId,
    });

    if (existing) {
      await existing.deleteOne();
      return res.status(200).json({
        success: true,
        message: "Bookmark removed",
        bookmarked: false,
      });
    }

    await Bookmark.create({
      user: req.user.id,
      prompt: promptId,
    });

    return res.status(201).json({
      success: true,
      message: "Prompt bookmarked",
      bookmarked: true,
    });
  } catch (error) {
    return next(error);
  }
};

exports.checkBookmark = async (req, res, next) => {
  try {
    const { promptId } = req.params;

    if (!isValidObjectId(promptId)) {
      return res.status(400).json({ success: false, message: "Invalid prompt ID" });
    }

    const bookmark = await Bookmark.findOne({
      user: req.user.id,
      prompt: promptId,
    });

    return res.status(200).json({
      success: true,
      bookmarked: Boolean(bookmark),
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMyBookmarks = async (req, res, next) => {
  try {
    const { clampPage, clampLimit } = require("../utils/pagination");
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 9);
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      Bookmark.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "prompt",
          populate: { path: "creator", select: "name email photoURL" },
        }),
      Bookmark.countDocuments({ user: req.user.id }),
    ]);

    const viewer = await enrichViewerFromRequest(req, User);
    const prompts = sanitizePromptsForViewer(
      bookmarks
        .map((entry) => entry.prompt)
        .filter((prompt) => prompt && prompt.status === "approved"),
      viewer
    );

    return res.status(200).json({
      success: true,
      total,
      results: prompts.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: prompts,
    });
  } catch (error) {
    return next(error);
  }
};
