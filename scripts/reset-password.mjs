#!/usr/bin/env node
/**
 * Reset (or set) a Firebase Auth user's password directly via Admin SDK
 * — bypasses the "send reset email" flow when the admin already knows
 * what password they want to give the user.
 *
 * Usage:
 *   node scripts/reset-password.mjs <email> <newPassword>
 *
 * Requires serviceAccount.json at repo root (same one used by seed).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/reset-password.mjs <email> <newPassword>");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const cred = JSON.parse(readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"));
initializeApp({ credential: cert(cred) });
const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  console.log(`[reset] ${email} (uid=${user.uid}) password updated → "${password}"`);
} catch (e) {
  console.error("[reset] failed:", e.message);
  process.exit(1);
}
