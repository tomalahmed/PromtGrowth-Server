const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateEnv() {
  requireEnv("MONGODB_URI");
  requireEnv("JWT_SECRET");

  if (isProduction && process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }

  if (isProduction) {
    requireEnv("CLIENT_URL");
    requireEnv("FIREBASE_PROJECT_ID");
    requireEnv("FIREBASE_CLIENT_EMAIL");
    requireEnv("FIREBASE_PRIVATE_KEY");

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      console.warn(
        "[env] STRIPE_SECRET_KEY is not set — payments will be disabled."
      );
    }
  }

  if (isProduction && process.env.ENABLE_DEMO === "true") {
    console.warn("[env] ENABLE_DEMO=true — demo accounts are allowed in production.");
  }
}

module.exports = {
  isProduction,
  validateEnv,
};
