const { initializeApp, getApps, getApp, cert } = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");

let adminApp = null;
let initError = null;

function normalizePrivateKey(raw) {
  if (!raw) {
    return null;
  }

  let key = String(raw).trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").trim();

  if (!key.includes("BEGIN PRIVATE KEY")) {
    return null;
  }

  return key;
}

function getFirebaseAdmin() {
  if (adminApp) {
    return adminApp;
  }

  if (initError) {
    return null;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId) {
    initError = "FIREBASE_PROJECT_ID is not set";
    console.error(`[firebase-admin] ${initError}`);
    return null;
  }

  if (!clientEmail || !privateKey) {
    initError = "FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing or invalid";
    console.error(`[firebase-admin] ${initError}`);
    return null;
  }

  try {
    if (getApps().length > 0) {
      adminApp = getApp();
      return adminApp;
    }

    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    console.log(`[firebase-admin] Initialized for project: ${projectId}`);
    return adminApp;
  } catch (error) {
    initError = error.message;
    console.error("[firebase-admin] Failed to initialize:", error.message);
    return null;
  }
}

function getFirebaseAdminStatus() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || null;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || null;
  const hasPrivateKey = Boolean(normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY));
  const app = getFirebaseAdmin();

  return {
    configured: Boolean(app),
    projectId,
    hasClientEmail: Boolean(clientEmail),
    hasPrivateKey,
    initError,
  };
}

function getGoogleSyncErrorMessage(error) {
  const message = error?.message || "";

  if (message.includes("aud") || message.includes("audience")) {
    return "Firebase project mismatch. Ensure client NEXT_PUBLIC_FIREBASE_PROJECT_ID matches server FIREBASE_PROJECT_ID.";
  }

  if (
    message.includes("private key") ||
    message.includes("PEM") ||
    message.includes("DECODER")
  ) {
    return "Server Firebase private key is invalid. Re-paste FIREBASE_PRIVATE_KEY on Render as a single line with \\n escapes.";
  }

  return "Invalid or expired Google sign-in token";
}

async function verifyFirebaseIdToken(idToken) {
  const app = getFirebaseAdmin();

  if (!app) {
    const error = new Error(
      initError || "Firebase Admin is not configured on the server"
    );
    error.statusCode = 503;
    throw error;
  }

  if (!idToken || typeof idToken !== "string" || idToken.split(".").length !== 3) {
    const error = new Error("Malformed Firebase ID token");
    error.statusCode = 400;
    throw error;
  }

  return getAuth(app).verifyIdToken(idToken);
}

module.exports = {
  getFirebaseAdmin,
  getFirebaseAdminStatus,
  getGoogleSyncErrorMessage,
  verifyFirebaseIdToken,
};
