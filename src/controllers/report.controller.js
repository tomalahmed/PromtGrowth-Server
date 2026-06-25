const Report = require("../models/Report.model");
const Prompt = require("../models/Prompt.model");
const User = require("../models/User.model");

const isValidObjectId = (id) => id && /^[0-9a-fA-F]{24}$/.test(id);

const VALID_REASONS = [
  "Inappropriate",
  "Spam",
  "Copyright",
  "Inaccurate",
  "Offensive",
  "Other",
];

exports.createReport = async (req, res, next) => {
  try {
    const { promptId } = req.params;
    const { reason, description = "" } = req.body;

    if (!isValidObjectId(promptId)) {
      return res.status(400).json({ success: false, message: "Invalid prompt ID" });
    }

    if (!reason || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: "A valid report reason is required",
      });
    }

    const prompt = await Prompt.findById(promptId);
    if (!prompt) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    const report = await Report.create({
      user: req.user.id,
      prompt: promptId,
      reason,
      description: String(description).trim(),
    });

    await report.populate("user", "name email");
    await report.populate("prompt", "title");

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAllReports = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email")
        .populate({
          path: "prompt",
          select: "title creator",
          populate: { path: "creator", select: "name email" },
        }),
      Report.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      results: reports.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: reports,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID" });
    }

    if (!["dismiss", "warn", "remove-prompt"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be dismiss, warn, or remove-prompt",
      });
    }

    const report = await Report.findById(id).populate({
      path: "prompt",
      populate: { path: "creator", select: "_id name email" },
    });

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    if (action === "dismiss") {
      report.status = "dismissed";
      await report.save();
    } else if (action === "warn") {
      report.status = "resolved";
      await report.save();
    } else if (action === "remove-prompt") {
      const promptId = report.prompt?._id || report.prompt;

      if (promptId) {
        const prompt = await Prompt.findById(promptId);
        if (prompt) {
          await Prompt.findByIdAndDelete(promptId);
          await User.findByIdAndUpdate(prompt.creator, { $inc: { promptCount: -1 } });
        }
      }

      report.status = "resolved";
      await report.save();
    }

    return res.status(200).json({
      success: true,
      message: `Report ${action === "dismiss" ? "dismissed" : "resolved"} successfully`,
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};
