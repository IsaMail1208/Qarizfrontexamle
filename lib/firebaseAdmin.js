import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let _app = null;

function ensureApp() {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!projectId || !serviceAccountJson) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }

  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  const cred = cert(JSON.parse(serviceAccountJson));

  _app = initializeApp({
    credential: cred,
    projectId,
    storageBucket: bucketName,
  });

  return _app;
}

export function getDb() {
  ensureApp();
  return getFirestore();
}

export function getBucket() {
  ensureApp();
  return getStorage().bucket();
}
