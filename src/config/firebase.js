import admin from 'firebase-admin';
import { cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

let firebaseAuth = null;
let isInitialized = false;

function initializeFirebase() {
  try {
    // Try several likely locations for the service account key so server
    // still works when started from different working directories.
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(process.cwd(), 'firebase-key.json'),
      join(process.cwd(), 'backend', 'firebase-key.json'),
      join(__dirname, '..', '..', 'firebase-key.json'),
      join(__dirname, '..', '..', '..', 'firebase-key.json')
    ];

    const keyPath = candidates.find(p => existsSync(p));
    if (!keyPath) {
      throw new Error(`firebase-key.json not found. Tried: ${candidates.join(', ')}`);
    }

    const serviceAccountJSON = readFileSync(keyPath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountJSON);
    
    // Initialize Firebase Admin SDK
    admin.initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
    firebaseAuth = getAuth();
    isInitialized = true;
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('⚠️ Firebase not configured:', error.message);
    isInitialized = false;
  }
}

try {
  initializeFirebase();
} catch (e) {
  console.error('Firebase error:', e.message);
}

export { firebaseAuth, isInitialized };