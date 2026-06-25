const Stripe = require("stripe");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn(
    "STRIPE_SECRET_KEY is not set. Payment endpoints will be unavailable."
  );
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const PREMIUM_PRICE_CENTS = Number(process.env.STRIPE_PREMIUM_PRICE_CENTS) || 500;

module.exports = {
  stripe,
  PREMIUM_PRICE_CENTS,
};
