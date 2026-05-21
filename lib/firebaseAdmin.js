import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "fs";
import { resolve } from "path";

let _app = null;

function ensureApp() {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!projectId || (!serviceAccountJson && !serviceAccountPath && !serviceAccountBase64)) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_PROJECT_ID and " +
      "FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64."
    );
  }

  let credData;
  if (serviceAccountBase64) {
    const jsonString = Buffer.from(serviceAccountBase64, "base64").toString("utf-8");
    credData = JSON.parse(jsonString);
  } else if (serviceAccountJson) {
    credData = JSON.parse(serviceAccountJson);
  } else {
    const absPath = resolve(serviceAccountPath);
    credData = JSON.parse(readFileSync(absPath, "utf-8"));
  }

  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
  const cred = cert(credData);

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
