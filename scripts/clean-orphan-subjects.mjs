#!/usr/bin/env node
/**
 * Delete /subjects docs that look like seed leftovers — empty
 * campusIds AND missing status. Anything an admin actually created
 * via the UI has both fields populated.
 *
 * Usage:
 *   node scripts/clean-orphan-subjects.mjs            # dry-run, lists matches
 *   node scripts/clean-orphan-subjects.mjs --apply    # actually delete
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const snap = await db.collection("subjects").get();
const targets = snap.docs.filter((d) => {
  const data = d.data();
  const hasCampus = Array.isArray(data.campusIds) && data.campusIds.length > 0;
  const hasStatus = data.status === "active" || data.status === "archived";
  return !hasCampus || !hasStatus;
});

if (targets.length === 0) {
  console.log("[clean] No orphan subjects found.");
  process.exit(0);
}

console.log(
  `[clean] ${targets.length} orphan subject doc(s) found:`,
);
for (const d of targets) {
  const data = d.data();
  console.log(
    `  ${d.id}`.padEnd(30),
    `name=${data.name ?? "—"}`.padEnd(20),
    `campusIds=${JSON.stringify(data.campusIds ?? [])}`,
    `status=${data.status ?? "—"}`,
  );
}

if (!apply) {
  console.log("\n[clean] Dry-run. Pass --apply to actually delete.");
  process.exit(0);
}

for (const d of targets) {
  await d.ref.delete();
  console.log(`[clean] deleted ${d.id}`);
}
console.log(`\n[clean] Done. Removed ${targets.length} doc(s).`);
