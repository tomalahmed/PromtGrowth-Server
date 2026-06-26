const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const sanitizeInput = require("./middlewares/sanitizeInput");
const errorHandler = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { handleWebhook } = require("./controllers/payment.controller");
const authRoutes = require("./routes/auth.routes");
const promptRoutes = require("./routes/prompt.routes");
const bookmarkRoutes = require("./routes/bookmark.routes");
const reviewRoutes = require("./routes/review.routes");
const reportRoutes = require("./routes/report.routes");
const paymentRoutes = require("./routes/payment.routes");
const userRoutes = require("./routes/user.routes");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, ""),
    credentials: true,
  })
);

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(sanitizeInput);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/prompts", promptRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use(errorHandler);

module.exports = app;
