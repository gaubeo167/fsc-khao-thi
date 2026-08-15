/**
 * Firebase Admin SDK singleton for server routes.
 *
 * Credentials come from `FIREBASE_SERVICE_ACCOUNT` — a JSON string holding
 * the service-account file. On Vercel: paste the file content into the env
 * var directly. Locally: read `serviceAccount.json` at repo root (already
 * gitignored).
 *
 * Throws lazily — server routes that need it call `getAdmin()` and fail
 * with a clear error if env is missing instead of crashing module init.
 */

import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface AdminBundle {
  app: App;
  auth: Auth;
  db: Firestore;
}

let cached: AdminBundle | null = null;

function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().length > 0) {
    try {
      return JSON.parse(inline);
    } catch (err) {
      throw new Error(
        "[firebase-admin] FIREBASE_SERVICE_ACCOUNT is not valid JSON. " +
          "Paste the full contents of serviceAccount.json into this env var.",
      );
    }
  }
  // Local dev fallback: read the gitignored file from the monorepo root.
  // process.cwd() at runtime is apps/web/ when started via pnpm dev.
  const candidates = [
    resolve(process.cwd(), "serviceAccount.json"),
    resolve(process.cwd(), "..", "..", "serviceAccount.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf8"));
    }
  }
  throw new Error(
    "[firebase-admin] No credentials. Set FIREBASE_SERVICE_ACCOUNT env var " +
      "(JSON of service-account file) or place serviceAccount.json at repo root.",
  );
}

/**
 * Đang chạy với Firebase Emulator hay không.
 *
 * Emulator KHÔNG kiểm chữ ký, nên Admin SDK chỉ cần `projectId` — đòi service
 * account ở chế độ này là chặn oan: máy lập trình viên không có (và không nên
 * có) khoá production nằm sẵn trên đĩa.
 */
function usingEmulator(): boolean {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ??
      process.env.FIREBASE_AUTH_EMULATOR_HOST,
  );
}

export function getAdmin(): AdminBundle {
  if (cached) return cached;
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp(
          usingEmulator()
            ? {
                projectId:
                  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-fsc",
              }
            : { credential: cert(loadCredential()) },
        );
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
