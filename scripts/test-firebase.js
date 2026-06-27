require("dotenv").config();

const { initializeApp, getApps, getApp, cert } = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");

function normalizePrivateKey(raw) {
  if (!raw) return null;
  let k = String(raw).trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  k = k.replace(/\\n/g, "\n").trim();
  return k;
}

const normalized = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

try {
  const crypto = require("crypto");
  crypto.createPrivateKey(normalized);
  console.log("PEM validation: OK");
} catch (error) {
  console.error("PEM validation: FAILED -", error.message);
  process.exit(1);
}

try {
  if (getApps().length > 0) {
    getApp().delete();
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalized,
    }),
  });

  console.log("Firebase Admin initialized:", app.name);
  console.log("Project:", process.env.FIREBASE_PROJECT_ID);
} catch (error) {
  console.error("Firebase Admin init failed:", error.message);
  process.exit(1);
}
