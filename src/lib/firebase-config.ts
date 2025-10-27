let firebaseConfig: any = {};

try {
  // In a Next.js environment, public environment variables are prefixed with NEXT_PUBLIC_
  // and are accessible in the browser.
  if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG) {
    firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG);
  }
} catch (e) {
  console.error(
    "Could not parse NEXT_PUBLIC_FIREBASE_CONFIG. Make sure it's a valid JSON string.",
    e
  );
}

export const FIREBASE_CONFIG = firebaseConfig;

// As per the proposal, appId is an external variable.
// We'll simulate this with a public environment variable.
export const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "default-app-id";
