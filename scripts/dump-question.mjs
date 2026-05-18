#!/usr/bin/env node
/**
 * Dump a single /questions doc — useful for debugging weird preview
 * behaviour like underline markers landing in the wrong place.
 *
 * Usage:
 *   node scripts/dump-question.mjs <docId>
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , docId] = process.argv;
if (!docId) {
  console.error("Usage: node scripts/dump-question.mjs <docId>");
  process.exit(1);
}

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const snap = await db.collection("questions").doc(docId).get();
if (!snap.exists) {
  console.log(`(no question with id ${docId})`);
  process.exit(0);
}
const data = snap.data();
console.log(`id:        ${snap.id}`);
console.log(`type:      ${data.type}`);
console.log(`kho:       ${data.kho}`);
console.log(`status:    ${data.status}`);
console.log(`subjectId: ${data.subjectId}`);
console.log(`gradeId:   ${data.gradeId}`);
console.log("─── content ───────────────────────────────────");
console.log(data.content);
console.log("───────────────────────────────────────────────");
const reUnderline = /\[u:[^\]\n]+\]/g;
const markers = [...(data.content ?? "").matchAll(reUnderline)];
console.log(`\n[u:...] markers found: ${markers.length}`);
for (const m of markers) {
  console.log(`  at index ${m.index}: ${m[0]}`);
}
