const express = require("express");
const router = express.Router();
const {
  getAllPrompts,
  getFeatured,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  incrementCopy,
  approvePrompt,
  rejectPrompt,
  featurePrompt,
} = require("../controllers/prompt.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyRole = require("../middlewares/verifyRole");

// ===== PUBLIC ROUTES (no authentication required) =====

// Get all approved public prompts with filters, search, sort, pagination
// GET /api/prompts?search=&category=&aiTool=&difficulty=&sort=&page=&limit=
router.get("/", getAllPrompts);

// Get featured prompts for landing page
// GET /api/prompts/featured
router.get("/featured", getFeatured);

// ===== PRIVATE ROUTES (require authentication) =====

// Get prompt by ID (with premium content lock)
// GET /api/prompts/:id
router.get("/:id", verifyToken, getPromptById);

// Create a new prompt (free users max 3)
// POST /api/prompts
router.post("/", verifyToken, createPrompt);

// Update a prompt (owner or admin only)
// PATCH /api/prompts/:id
router.patch("/:id", verifyToken, updatePrompt);

// Delete a prompt (owner or admin only)
// DELETE /api/prompts/:id
router.delete("/:id", verifyToken, deletePrompt);

// Increment copy count (requires access to content)
// PATCH /api/prompts/:id/copy
router.patch("/:id/copy", verifyToken, incrementCopy);

// ===== ADMIN-ONLY ROUTES (require admin role) =====

// Approve a pending prompt
// PATCH /api/prompts/:id/approve
router.patch("/:id/approve", verifyToken, verifyRole("admin"), approvePrompt);

// Reject a prompt with feedback
// PATCH /api/prompts/:id/reject
router.patch("/:id/reject", verifyToken, verifyRole("admin"), rejectPrompt);

// Toggle featured status of a prompt
// PATCH /api/prompts/:id/feature
router.patch("/:id/feature", verifyToken, verifyRole("admin"), featurePrompt);

module.exports = router;
