#!/usr/bin/env node
/**
 * One-time bootstrap: seeds the initial superadmin into Firebase Auth +
 * Firestore so the app has a usable login on a fresh project.
 *
 * Run AFTER:
 *   1. firebase login
 *   2. firebase init (Firestore + Auth + Hosting)
 *   3. Enable Email/Password sign-in in Auth → Sign-in method
 *   4. Place a service-account JSON at ./serviceAccount.json
 *      (Firebase Console → Project Settings → Service Accounts →
 *       "Generate new private key")
 *
 * Usage:
 *   node scripts/seed-firebase.mjs
 *
 * It is safe to re-run — if the superadmin already exists, the script
 * updates the profile doc and skips Auth creation.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE_ACCOUNT_PATH = resolve(process.cwd(), "serviceAccount.json");
const SUPERADMIN_EMAIL = "vietnb4@fpt.edu.vn";
const SUPERADMIN_NAME = "Nguyễn Bá Việt (Superadmin)";
const SUPERADMIN_PASSWORD = process.env.SEED_PASSWORD ?? "fsc2026!";

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
} catch (e) {
  console.error(
    `\n[seed] Cannot read ${SERVICE_ACCOUNT_PATH}.\n` +
      `Download from Firebase Console → Project Settings → Service Accounts and save it at the repo root.\n`,
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

/**
 * Idempotent helper: write or skip if doc exists (set with merge:false
 * would overwrite admin's edits, so we check first).
 */
async function ensureDoc(collection, id, data) {
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (snap.exists) return false;
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() });
  return true;
}

async function seedCatalog() {
  // Minimal catalog — 1 campus, 3 grades (K10-K12 cấp 3 default), 1 class
  // per grade, 3 subjects. Admin can edit / extend from the UI.
  const campusId = "campus-demo";
  await ensureDoc("campuses", campusId, {
    id: campusId,
    name: "Trường Demo FSC",
    code: "DEMO",
    region: "north",
    tier: "high",
    address: "—",
    phone: "—",
    status: "active",
    gradeIds: Array.from({ length: 12 }, (_, i) => `grade-${i + 1}`),
    createdAt: new Date().toISOString(),
  });

  // K1 → K12 — global catalog shared across all campuses. Each campus
  // picks a subset via its `gradeIds` field (derived from `tier`).
  const grades = Array.from({ length: 12 }, (_, i) => ({
    id: `grade-${i + 1}`,
    name: `Khối ${i + 1}`,
    code: `K${i + 1}`,
  }));
  for (const g of grades) {
    await ensureDoc("grades", g.id, {
      ...g,
      campusId: null,
      classCount: 0,
      studentCount: 0,
      createdAt: new Date().toISOString(),
    });
  }

  const classes = [
    { id: "class-10a1", code: "10A1", name: "10A1", gradeId: "grade-10" },
    { id: "class-11a1", code: "11A1", name: "11A1", gradeId: "grade-11" },
    { id: "class-12a1", code: "12A1", name: "12A1", gradeId: "grade-12" },
  ];
  for (const c of classes) {
    await ensureDoc("classes", c.id, {
      ...c,
      campusId,
      studentCount: 0,
      homeroomTeacher: null,
      homeroomTeacherId: null,
      createdAt: new Date().toISOString(),
    });
  }

  const subjects = [
    { id: "subject-toan", name: "Toán", code: "TOAN", color: "#2563eb" },
    { id: "subject-van", name: "Ngữ văn", code: "VAN", color: "#dc2626" },
    { id: "subject-anh", name: "Tiếng Anh", code: "ANH", color: "#16a34a" },
  ];
  for (const s of subjects) {
    await ensureDoc("subjects", s.id, {
      ...s,
      campusIds: [campusId],
      createdAt: new Date().toISOString(),
    });
  }

  console.log(`[seed] Catalog seeded: 1 campus, ${grades.length} grades, ${classes.length} classes, ${subjects.length} subjects.`);
}

async function ensureSuperadmin() {
  let uid;
  try {
    const existing = await auth.getUserByEmail(SUPERADMIN_EMAIL);
    uid = existing.uid;
    console.log(`[seed] Superadmin already exists (uid=${uid}). Updating profile doc only.`);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    const created = await auth.createUser({
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      emailVerified: true,
      displayName: SUPERADMIN_NAME,
    });
    uid = created.uid;
    console.log(`[seed] Created superadmin uid=${uid}, password="${SUPERADMIN_PASSWORD}"`);
  }

  await db.collection("users").doc(uid).set(
    {
      id: uid,
      email: SUPERADMIN_EMAIL,
      name: SUPERADMIN_NAME,
      role: "superadmin",
      campusId: null,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`[seed] /users/${uid} profile doc written.`);
}

async function main() {
  await ensureSuperadmin();
  await seedCatalog();
  console.log("\n[seed] Done. You can now log in at /login with:");
  console.log(`       email:    ${SUPERADMIN_EMAIL}`);
  console.log(`       password: ${SUPERADMIN_PASSWORD}`);
  console.log("\n[seed] Change the password after first login.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
