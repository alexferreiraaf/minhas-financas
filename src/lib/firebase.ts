import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { FIREBASE_CONFIG } from "@/lib/firebase-config";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Check if Firebase config is provided
if (Object.keys(FIREBASE_CONFIG).length > 0) {
  // Initialize Firebase only if it hasn't been initialized yet
  if (!getApps().length) {
    try {
      app = initializeApp(FIREBASE_CONFIG);
      auth = getAuth(app);
      db = getFirestore(app);
    } catch (e) {
      console.error("Failed to initialize Firebase", e);
      // You might want to throw an error here or handle it gracefully
    }
  } else {
    // If already initialized, get the existing app
    app = getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  }
} else {
    console.warn("Firebase configuration is missing. Firebase services will not be available.");
}


export { app, auth, db };
