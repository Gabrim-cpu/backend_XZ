/**
 * Firestore Configuration
 *
 * Uses Firebase Firestore as the primary database.
 * This replaces MongoDB and integrates seamlessly with Firebase Auth.
 *
 * Setup:
 * 1. Set FIREBASE_PROJECT_ID in .env
 * 2. Download service account key from Firebase Console
 * 3. Set GOOGLE_APPLICATION_CREDENTIALS to path of the key file
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
);

if (Object.keys(serviceAccount).length === 0 && !admin.apps.length) {
  // If key not provided, use GOOGLE_APPLICATION_CREDENTIALS env var
  admin.initializeApp();
} else if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

// Enable offline persistence on client side (handled separately)
// Server-side doesn't need it

/**
 * Utility: Batch write operations
 * Firestore has a 500-document limit per batch
 */
async function batchWrite(operations) {
  const batches = [];
  for (let i = 0; i < operations.length; i += 500) {
    batches.push(operations.slice(i, i + 500));
  }

  for (const batch of batches) {
    const writeBatch = db.batch();
    batch.forEach(op => {
      const { type, ref, data } = op;
      if (type === 'set') writeBatch.set(ref, data);
      else if (type === 'update') writeBatch.update(ref, data);
      else if (type === 'delete') writeBatch.delete(ref);
    });
    await writeBatch.commit();
  }
}

/**
 * Utility: Transaction helper
 */
async function runTransaction(callback) {
  return db.runTransaction(callback);
}

/**
 * Utility: Listen to real-time changes
 * Returns unsubscribe function
 */
function onSnapshot(query, callback) {
  return query.onSnapshot(callback);
}

module.exports = {
  db,
  admin,
  batchWrite,
  runTransaction,
  onSnapshot,
};
