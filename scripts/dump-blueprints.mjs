#!/usr/bin/env node
/**
 * List every /blueprints doc — check for id collisions or shared
 * references that would explain "rename one blueprint and another
 * changes too".
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const snap = await db.collection("blueprints").get();
if (snap.empty) {
  console.log("(no blueprints)");
  process.exit(0);
}
console.log(`Total docs: ${snap.size}`);
const byId = new Map();
for (const d of snap.docs) {
  const data = d.data();
  const inner = data.id ?? "(missing)";
  const key = `${d.id} | inner.id=${inner}`;
  byId.set(d.id, (byId.get(d.id) ?? 0) + 1);
  console.log(
    `  doc.id=${d.id.padEnd(10)} | data.id=${String(inner).padEnd(10)} | name="${data.name}" | subjectId=${data.subjectId} | gradeId=${data.gradeId}`,
  );
}
const dups = [...byId.entries()].filter(([, n]) => n > 1);
if (dups.length > 0) {
  console.log("\n!! DUPLICATE doc.ids:", dups);
}
