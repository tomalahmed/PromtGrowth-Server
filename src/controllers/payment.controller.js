const User = require("../models/User.model");
const { DEMO_EMAILS, isDemoViewer } = require("../utils/demoScope");
const Payment = require("../models/Payment.model");
const { stripe, PREMIUM_PRICE_CENTS } = require("../config/stripe");
const { clampPage, clampLimit } = require("../utils/pagination");

const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:3000";

exports.createCheckoutSession = async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isPremium) {
      return res.status(400).json({
        success: false,
        message: "You already have Premium access",
      });
    }

    const clientUrl = getClientUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: String(user._id),
      metadata: {
        userId: String(user._id),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PREMIUM_PRICE_CENTS,
            product_data: {
              name: "PromptGrowth Premium",
              description:
                "One-time payment to unlock private prompts, copy premium content, and leave reviews.",
            },
          },
        },
      ],
      success_url: `${clientUrl}/pricing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/pricing?payment=cancelled`,
    });

    return res.status(200).json({
      success: true,
      message: "Checkout session created",
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server",
      });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(503).json({
        success: false,
        message: "Stripe webhook secret is not configured",
      });
    }

    const signature = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Webhook signature verification failed: ${error.message}`,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await grantPremiumFromSession(session);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
};

async function grantPremiumFromSession(session) {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId) {
    throw new Error("Missing user reference on checkout session");
  }

  const existingPayment = await Payment.findOne({
    stripeSessionId: session.id,
  });

  if (!existingPayment) {
    await Payment.create({
      user: userId,
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent || "",
      email: session.customer_details?.email || session.customer_email || "",
      amount: session.amount_total || PREMIUM_PRICE_CENTS,
      status: "paid",
      paidAt: new Date(),
    });
  } else if (existingPayment.status !== "paid") {
    existingPayment.status = "paid";
    existingPayment.paidAt = new Date();
    existingPayment.stripePaymentIntentId =
      session.payment_intent || existingPayment.stripePaymentIntentId;
    await existingPayment.save();
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { isPremium: true },
    { new: true }
  ).select("-password");

  return user;
}

exports.verifyCheckoutSession = async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server",
      });
    }

    const sessionId = req.body?.sessionId;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed yet",
      });
    }

    const sessionUserId = session.metadata?.userId || session.client_reference_id;

    if (String(sessionUserId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Checkout session does not belong to this account",
      });
    }

    const user = await grantPremiumFromSession(session);

    return res.status(200).json({
      success: true,
      message: "Premium activated",
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAllPayments = async (req, res, next) => {
  try {
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (isDemoViewer(req)) {
      filter.email = { $in: DEMO_EMAILS };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email role"),
      Payment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      results: payments.length,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data: payments,
    });
  } catch (error) {
    return next(error);
  }
};
