import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { FIREBASE_CONFIG } from "@/lib/firebase-config";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (typeof window !== "undefined" && !getApps().length) {
  try {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Failed to initialize Firebase", e);
  }
} else if (getApps().length) {
  app = getApp();
  auth = getAuth(app);
  db = getFirestore(app);
}

// @ts-ignore
export { app, auth, db };
