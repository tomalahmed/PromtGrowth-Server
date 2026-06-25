const express = require("express");
const { createReport, getAllReports, updateReport } = require("../controllers/report.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyRole = require("../middlewares/verifyRole");

const router = express.Router();

router.post("/:promptId", verifyToken, createReport);
router.get("/", verifyToken, verifyRole("admin"), getAllReports);
router.patch("/:id", verifyToken, verifyRole("admin"), updateReport);

module.exports = router;
