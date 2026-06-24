const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = app;
