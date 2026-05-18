#!/usr/bin/env node
/**
 * Print one user's profile doc to verify their role + campusId match
 * what the auth session is supposed to expose.
 *
 * Usage:
 *   node scripts/dump-user.mjs <email>
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , email] = process.argv;
if (!email) {
  console.error("Usage: node scripts/dump-user.mjs <email>");
  process.exit(1);
}

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const auth = getAuth();
const db = getFirestore();

const u = await auth.getUserByEmail(email);
console.log(`Firebase Auth: uid=${u.uid}, email=${u.email}, disabled=${u.disabled}`);
const snap = await db.collection("users").doc(u.uid).get();
if (!snap.exists) {
  console.log(`Firestore /users/${u.uid}: (no profile doc)`);
  process.exit(0);
}
const data = snap.data();
console.log(`Firestore /users/${u.uid}:`);
console.log(`  role:       ${data.role}`);
console.log(`  campusId:   ${data.campusId}`);
console.log(`  status:     ${data.status}`);
console.log(`  name:       ${data.name}`);
