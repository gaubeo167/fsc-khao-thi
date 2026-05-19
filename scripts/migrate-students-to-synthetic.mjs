#!/usr/bin/env node
/**
 * Migrate existing student accounts so their Firebase Auth email is
 * the synthetic `{username}@students.fsc.local` address. After
 * migration, the login form can construct the address directly from
 * the typed username without any Firestore lookup.
 *
 * What it does for each student doc:
 *   1. Read username (skip if missing).
 *   2. Build synthetic = `${username}@students.fsc.local`.
 *   3. If Firebase Auth user's email is already synthetic → skip.
 *   4. Else: rename the Firebase Auth user's email to synthetic +
 *      stash the old real email as `contactEmail` on the Firestore
 *      profile.
 *
 * Run AFTER deploying the new code so future creates already use the
 * synthetic pattern.
 *
 * Usage:
 *   node scripts/migrate-students-to-synthetic.mjs            # dry-run
 *   node scripts/migrate-students-to-synthetic.mjs --apply    # commit
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const auth = getAuth();
const db = getFirestore();

const snap = await db.collection("users").where("role", "==", "student").get();
console.log(`[migrate] Found ${snap.size} student doc(s).`);

let touched = 0;
for (const d of snap.docs) {
  const data = d.data();
  const username = (data.username ?? "").trim().toLowerCase();
  if (!username) {
    console.log(`  skip ${d.id} — no username`);
    continue;
  }
  const synthetic = `${username}@students.fsc.local`;
  let authUser;
  try {
    authUser = await auth.getUser(d.id);
  } catch (e) {
    console.log(`  skip ${d.id} — auth record not found`);
    continue;
  }
  if (authUser.email === synthetic) {
    console.log(`  skip ${d.id} — already synthetic (${synthetic})`);
    continue;
  }
  const oldEmail = authUser.email ?? data.email ?? null;
  console.log(
    `  ${apply ? "MIGRATE" : "DRY"} ${d.id}: ${oldEmail} → ${synthetic}`,
  );
  if (!apply) {
    touched++;
    continue;
  }
  await auth.updateUser(d.id, { email: synthetic, emailVerified: true });
  await d.ref.update({
    email: synthetic,
    contactEmail: oldEmail && !oldEmail.endsWith("@students.fsc.local") ? oldEmail : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  touched++;
}

console.log(`\n[migrate] ${apply ? "Done" : "Dry-run"}: ${touched} student(s) ${apply ? "migrated" : "would be migrated"}.`);
if (!apply) console.log("[migrate] Re-run with --apply to commit.");
