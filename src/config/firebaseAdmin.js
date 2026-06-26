const { isProduction } = require("./env");

let adminApp = null;

function getFirebaseAdmin() {
  if (adminApp) {
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

  if (!projectId) {
    return null;
  }

  try {
    const admin = require("firebase-admin");

    if (admin.apps.length > 0) {
      adminApp = admin.app();
      return adminApp;
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      admin.initializeApp({ projectId });
    }

    adminApp = admin.app();
    return adminApp;
  } catch (error) {
    if (isProduction) {
      console.error("[firebase-admin] Failed to initialize:", error.message);
    }
    return null;
  }
}

async function verifyFirebaseIdToken(idToken) {
  const app = getFirebaseAdmin();

  if (!app) {
    const error = new Error("Firebase Admin is not configured on the server");
    error.statusCode = 503;
    throw error;
  }

  const admin = require("firebase-admin");
  return admin.auth().verifyIdToken(idToken);
}

module.exports = {
  getFirebaseAdmin,
  verifyFirebaseIdToken,
};
