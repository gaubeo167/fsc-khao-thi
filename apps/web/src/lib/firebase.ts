"use client";

/**
 * Firebase app singleton + emulator wiring.
 *
 * Loaded lazily: the SDK is only initialised the first time `getFirebase()`
 * is called on the client. Server components / SSR paths never touch it.
 *
 * Config comes from `NEXT_PUBLIC_FIREBASE_*` env vars — see
 * `apps/web/.env.example` for the full list. Throwing here at startup
 * (rather than later inside a query) gives a clear error if someone
 * forgets to fill in `.env.local`.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

interface FirebaseBundle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let cached: FirebaseBundle | null = null;

function readConfig() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, "_$&").toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(
      `[firebase] Missing env vars: ${missing.join(", ")}. ` +
        `Copy apps/web/.env.example to .env.local and fill in values from Firebase Console.`,
    );
  }
  return cfg as Required<typeof cfg>;
}

/**
 * `true` once `getFirebase()` has been called successfully at least once.
 * Cheap way for AuthBootstrap to decide whether to start listeners.
 *
 * We use the env presence rather than memoised init result so callers
 * can probe synchronously without triggering initialisation.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
}

export function getFirebase(): FirebaseBundle {
  if (cached) return cached;
  if (typeof window === "undefined") {
    throw new Error(
      "[firebase] getFirebase() called on the server. Wrap callers in a Client Component or guard with `typeof window !== 'undefined'`.",
    );
  }
  const app: FirebaseApp =
    getApps().length > 0 ? getApp() : initializeApp(readConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    // Idempotent: Firebase SDK throws on second call; guard with a flag.
    const w = window as unknown as { __fsc_emu?: boolean };
    if (!w.__fsc_emu) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      w.__fsc_emu = true;
    }
  }

  cached = { app, auth, db, storage };
  return cached;
}

export function getDb(): Firestore {
  return getFirebase().db;
}

export function getAuthSafe(): Auth {
  return getFirebase().auth;
}

export function getStorageSafe(): FirebaseStorage {
  return getFirebase().storage;
}
