const Prompt = require("../models/Prompt.model");
const User = require("../models/User.model");
const ApiFeatures = require("../utils/apiFeatures");

// @desc Get all public approved prompts with filters, search, sort, pagination
// @access Public
// @route GET /api/prompts
exports.getAllPrompts = async (req, res, next) => {
  try {
    const baseMatch = {
      status: "approved",
      visibility: "public",
    };

    const countQuery = Prompt.find(baseMatch);
    const countFeatures = new ApiFeatures(countQuery, req.query);
    countFeatures.search().filter();
    const total = await countFeatures.countDocuments(Prompt);

    const listQuery = Prompt.find(baseMatch).populate(
      "creator",
      "name email photoURL"
    );
    const features = new ApiFeatures(listQuery, req.query);
    features.search().filter().sort().paginate();

    const prompts = await features.query;
    const paginationInfo = await features.getPaginationInfo(total);

    res.status(200).json({
      success: true,
      total,
      results: prompts.length,
      pagination: paginationInfo,
      data: prompts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get 6 featured prompts
// @access Public
exports.getFeatured = async (req, res, next) => {
  try {
    const prompts = await Prompt.find({
      status: "approved",
      visibility: "public",
      featured: true,
    })
      .limit(6)
      .populate("creator", "name email photoURL")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: prompts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get prompt by ID with premium lock
// @access Private (logged in users only)
// @route GET /api/prompts/:id
exports.getPromptById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findById(id).populate(
      "creator",
      "name email photoURL role"
    );

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    // Check visibility and permission for private prompts
    const isOwner = req.user && String(prompt.creator._id) === String(req.user.id);
    const isAdmin = req.user && req.user.role === "admin";

    const promptData = prompt.toObject();
    let contentLocked = false;

    if (prompt.visibility === "private" && !isOwner && !isAdmin) {
      const userDoc = await User.findById(req.user.id);
      if (!userDoc || !userDoc.isPremium) {
        contentLocked = true;
        promptData.contentPreview = prompt.content.slice(0, 180);
        promptData.content = null;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...promptData,
        contentLocked,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create a new prompt
// @access Private (user/creator)
// @route POST /api/prompts
exports.createPrompt = async (req, res, next) => {
  try {
    const { title, description, content, category, aiTool, tags, difficulty, thumbnail, visibility } = req.body;

    // Validate required fields
    if (!title || !description || !content || !category || !aiTool || !difficulty) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, description, content, category, aiTool, difficulty",
      });
    }

    // Validate field lengths
    if (title.trim().length < 5 || title.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: "Title must be between 5 and 150 characters",
      });
    }

    if (content.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Content must be at least 20 characters",
      });
    }

    // Validate difficulty enum
    if (!["Beginner", "Intermediate", "Pro"].includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: "Difficulty must be one of: Beginner, Intermediate, Pro",
      });
    }

    // Validate visibility enum
    if (visibility && !["public", "private"].includes(visibility)) {
      return res.status(400).json({
        success: false,
        message: "Visibility must be either public or private",
      });
    }

    // Check free tier limit (3 prompts for non-premium users)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isPremium) {
      const promptCount = await Prompt.countDocuments({
        creator: req.user.id,
        status: { $ne: "rejected" },
      });

      if (promptCount >= 3) {
        return res.status(403).json({
          success: false,
          message: "Free tier users can only create 3 prompts. Upgrade to premium for unlimited.",
        });
      }
    }

    const newPrompt = new Prompt({
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      category: category.trim(),
      aiTool: aiTool.trim(),
      tags: tags ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      difficulty,
      thumbnail: thumbnail ? thumbnail.trim() : "",
      visibility: visibility || "public",
      creator: req.user.id,
      status: "pending",
      copyCount: 0,
    });

    await newPrompt.save();
    await newPrompt.populate("creator", "name email photoURL");

    // Increment user promptCount
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { promptCount: 1 },
    });

    res.status(201).json({
      success: true,
      message: "Prompt created successfully. Awaiting admin approval.",
      data: newPrompt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update a prompt
// @access Private (owner/admin)
// @route PATCH /api/prompts/:id
exports.updatePrompt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findById(id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    // Check permission
    const isOwner = String(prompt.creator) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this prompt",
      });
    }

    // Update allowed fields (prevent status/creator changes via this endpoint)
    const allowedFields = ["title", "description", "content", "category", "aiTool", "tags", "difficulty", "thumbnail", "visibility"];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "title") {
          const titleTrimmed = String(req.body[field]).trim();
          if (titleTrimmed.length < 5 || titleTrimmed.length > 150) {
            return res.status(400).json({
              success: false,
              message: "Title must be between 5 and 150 characters",
            });
          }
          updates[field] = titleTrimmed;
        } else if (field === "tags") {
          updates[field] = req.body[field].map((tag) => String(tag).trim()).filter(Boolean);
        } else if (field === "visibility") {
          if (!["public", "private"].includes(req.body[field])) {
            return res.status(400).json({
              success: false,
              message: "Visibility must be either public or private",
            });
          }
          updates[field] = req.body[field];
        } else if (field === "difficulty") {
          if (!["Beginner", "Intermediate", "Pro"].includes(req.body[field])) {
            return res.status(400).json({
              success: false,
              message: "Difficulty must be one of: Beginner, Intermediate, Pro",
            });
          }
          updates[field] = req.body[field];
        } else {
          updates[field] = String(req.body[field]).trim();
        }
      }
    }

    const updatedPrompt = await Prompt.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).populate("creator", "name email photoURL");

    res.status(200).json({
      success: true,
      message: "Prompt updated successfully",
      data: updatedPrompt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete a prompt
// @access Private (owner/admin)
// @route DELETE /api/prompts/:id
exports.deletePrompt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findById(id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    // Check permission
    const isOwner = String(prompt.creator) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this prompt",
      });
    }

    await Prompt.findByIdAndDelete(id);

    // Decrement user promptCount
    await User.findByIdAndUpdate(prompt.creator, {
      $inc: { promptCount: -1 },
    });

    res.status(200).json({
      success: true,
      message: "Prompt deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// @desc Increment copy count for a prompt
// @access Private (logged in users who can view content)
// @route PATCH /api/prompts/:id/copy
exports.incrementCopy = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findById(id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    // Check if user can access content
    const isOwner = String(prompt.creator) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (prompt.visibility === "private" && !isOwner && !isAdmin) {
      const userDoc = await User.findById(req.user.id);
      if (!userDoc || !userDoc.isPremium) {
        return res.status(403).json({
          success: false,
          message: "Cannot copy locked content. Premium access required.",
        });
      }
    }

    const updatedPrompt = await Prompt.findByIdAndUpdate(
      id,
      { $inc: { copyCount: 1 } },
      { new: true }
    ).populate("creator", "name email photoURL");

    res.status(200).json({
      success: true,
      message: "Prompt copied successfully",
      data: updatedPrompt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Approve a prompt (admin only)
// @access Private (admin)
// @route PATCH /api/prompts/:id/approve
exports.approvePrompt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findByIdAndUpdate(
      id,
      { status: "approved", rejectionFeedback: "" },
      { new: true }
    ).populate("creator", "name email promptCount");

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Prompt approved successfully",
      data: prompt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Reject a prompt with feedback (admin only)
// @access Private (admin)
// @route PATCH /api/prompts/:id/reject
exports.rejectPrompt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionFeedback } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    if (!rejectionFeedback || rejectionFeedback.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Rejection feedback is required",
      });
    }

    const prompt = await Prompt.findByIdAndUpdate(
      id,
      { status: "rejected", rejectionFeedback: rejectionFeedback.trim() },
      { new: true }
    ).populate("creator", "name email");

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Prompt rejected with feedback",
      data: prompt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Feature/unfeature a prompt (admin only)
// @access Private (admin)
// @route PATCH /api/prompts/:id/feature
exports.featurePrompt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prompt ID",
      });
    }

    const prompt = await Prompt.findById(id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found",
      });
    }

    prompt.featured = !prompt.featured;
    await prompt.save();

    res.status(200).json({
      success: true,
      message: prompt.featured ? "Prompt featured successfully" : "Prompt unfeatured successfully",
      data: prompt,
    });
  } catch (error) {
    next(error);
  }
};