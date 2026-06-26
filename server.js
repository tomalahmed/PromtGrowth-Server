require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/db");
const { validateEnv } = require("./src/config/env");

const PORT = process.env.PORT || 5000;

try {
  validateEnv();
} catch (error) {
  console.error("Environment validation failed:", error.message);
  process.exit(1);
}

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
