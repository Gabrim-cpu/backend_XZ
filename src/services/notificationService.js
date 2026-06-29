import { getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import '../config/firebase.js'; // ensure the Admin app is initialized before we use Firestore
import { pool } from '../config/database.js';

/**
 * Real-time notifications via Firestore.
 *
 * The backend writes a lightweight document to the `notifications` collection;
 * the frontend subscribes with onSnapshot and receives it instantly (no polling
 * or reload). Postgres/Mongo remain the source of truth — Firestore is just the
 * push channel.
 *
 * NOTE: this codebase uses the MODULAR firebase-admin API (firebase-admin/app,
 * firebase-admin/firestore). The old namespaced `admin.firestore()` is NOT
 * available here, so we must use getFirestore()/FieldValue.
 *
 * Fire-and-forget: every failure is caught and logged, never thrown, so a
 * notification problem can never break the originating request. Call without awaiting.
 */

const getDb = () => {
  try {
    if (!getApps().length) return null;
    return getFirestore();
  } catch {
    return null;
  }
};

export const createNotification = async ({
  recipientUserId,
  type,
  title,
  body,
  data = {},
  important = false,
}) => {
  try {
    const db = getDb();
    if (!db || !recipientUserId) return;

    const result = await pool.query(
      'SELECT firebase_uid FROM users WHERE id = $1',
      [recipientUserId]
    );
    const recipientUid = result.rows[0]?.firebase_uid;
    if (!recipientUid) return;

    await db.collection('notifications').add({
      recipientUid,
      type,
      title,
      body,
      data,
      important: !!important,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};
