#!/usr/bin/env node
/**
 * Standalone Firestore exporter — bypasses gcloud's bucket-required
 * export API (the project's billing is closed so creating the staging
 * bucket fails). Reads every doc in every named collection via
 * Firebase Admin SDK and writes one JSON per collection.
 *
 * Output: ~/fsc-handover/firestore/<collection>.json
 *   Each file is an array of { id, data } pairs. Timestamps become
 *   { __ts: "ISO-8601" } so the import side can re-hydrate. References
 *   become { __ref: "path/to/doc" }. Subcollections are walked
 *   recursively under each doc's `__sub` key.
 *
 * Usage:
 *   node scripts/export-firestore.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import admin from "firebase-admin";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SERVICE_ACCOUNT = join(REPO_ROOT, "serviceAccount.json");
const OUT_DIR = join(homedir(), "fsc-handover", "firestore");

if (!existsSync(SERVICE_ACCOUNT)) {
  console.error(`✗ serviceAccount.json not found at ${SERVICE_ACCOUNT}`);
  process.exit(1);
}

const COLLECTIONS = [
  "users",
  "campuses",
  "subjects",
  "grades",
  "classes",
  "questions",
  "blueprints",
  "packages",
  "shifts",
  "attempts",
  "grades_essay",
  "grading_assignments",
  "toc_nodes",
  "teaching_assignments",
  "proctor_events",
  "exam_forms",
  "audit_events",
  "learning_materials",
  "homework",
  "homework_attempts",
];

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
});

const db = admin.firestore();

/** Recursively convert Firestore native types → JSON-safe shapes
 *  with metadata markers so the import side can round-trip them. */
function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { __ts: value.toDate().toISOString() };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __geo: { lat: value.latitude, lng: value.longitude } };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __ref: value.path };
  }
  if (Buffer.isBuffer(value)) {
    return { __bytes: value.toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

async function exportSubcollections(docRef) {
  const subs = await docRef.listCollections();
  if (subs.length === 0) return undefined;
  const out = {};
  for (const sub of subs) {
    const snap = await sub.get();
    out[sub.id] = snap.docs.map((d) => ({
      id: d.id,
      data: normalize(d.data()),
    }));
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });

console.log(`Exporting ${COLLECTIONS.length} collections → ${OUT_DIR}\n`);

let totalDocs = 0;
const summary = [];

for (const name of COLLECTIONS) {
  process.stdout.write(`• ${name.padEnd(28, " ")} `);
  try {
    const snap = await db.collection(name).get();
    const rows = [];
    for (const doc of snap.docs) {
      const data = normalize(doc.data());
      const sub = await exportSubcollections(doc.ref);
      rows.push(sub ? { id: doc.id, data, __sub: sub } : { id: doc.id, data });
    }
    const outPath = join(OUT_DIR, `${name}.json`);
    writeFileSync(outPath, JSON.stringify(rows, null, 2));
    totalDocs += rows.length;
    summary.push({ name, count: rows.length });
    console.log(`${rows.length} docs`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    summary.push({ name, count: 0, error: err.message });
  }
}

writeFileSync(
  join(OUT_DIR, "_summary.json"),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      projectId: admin.app().options.projectId ?? "unknown",
      totalDocs,
      collections: summary,
    },
    null,
    2,
  ),
);

console.log(`\n✔ Done. ${totalDocs} docs across ${summary.length} collections.`);
console.log(`✔ Summary: ${join(OUT_DIR, "_summary.json")}`);

process.exit(0);
