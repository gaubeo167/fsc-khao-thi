#!/usr/bin/env node
/**
 * Companion to export-firestore.mjs — reads the JSON files in
 * ./firestore/<collection>.json (produced by the exporter) and writes
 * every doc back into the target project's Firestore via Admin SDK.
 *
 * Targets the project whose serviceAccount.json sits at repo root.
 *
 * Usage from the recipient's machine:
 *   1. Drop their own serviceAccount.json at the repo root
 *   2. Place the firestore/ folder next to this script
 *   3. node scripts/import-firestore.mjs
 *
 * Re-hydrates the `__ts` / `__geo` / `__ref` / `__bytes` markers back to
 * native Firestore types. Subcollections under `__sub` are written
 * recursively.
 *
 * Uses batched writes (max 450 ops per batch) to stay under Firestore's
 * 500-op limit per atomic batch.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import admin from "firebase-admin";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SERVICE_ACCOUNT = join(REPO_ROOT, "serviceAccount.json");
const FIRESTORE_DIR = join(SCRIPT_DIR, "..", "firestore");

if (!existsSync(SERVICE_ACCOUNT)) {
  console.error(`✗ serviceAccount.json not found at ${SERVICE_ACCOUNT}`);
  console.error(
    "  Download from Firebase Console → Project Settings → Service accounts.",
  );
  process.exit(1);
}

if (!existsSync(FIRESTORE_DIR)) {
  console.error(`✗ firestore/ directory not found at ${FIRESTORE_DIR}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
});

const db = admin.firestore();

function rehydrate(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(rehydrate);
  if (typeof value !== "object") return value;
  if (typeof value.__ts === "string") {
    return admin.firestore.Timestamp.fromDate(new Date(value.__ts));
  }
  if (value.__geo) {
    return new admin.firestore.GeoPoint(value.__geo.lat, value.__geo.lng);
  }
  if (typeof value.__ref === "string") {
    return db.doc(value.__ref);
  }
  if (typeof value.__bytes === "string") {
    return Buffer.from(value.__bytes, "base64");
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = rehydrate(v);
  }
  return out;
}

async function writeRows(collectionPath, rows) {
  const CHUNK = 450;
  let i = 0;
  while (i < rows.length) {
    const batch = db.batch();
    const slice = rows.slice(i, i + CHUNK);
    for (const row of slice) {
      const ref = db.collection(collectionPath).doc(row.id);
      batch.set(ref, rehydrate(row.data));
    }
    await batch.commit();
    i += CHUNK;
  }
  // Subcollections: walk per-row so each parent doc exists first.
  for (const row of rows) {
    if (!row.__sub) continue;
    for (const [subName, subRows] of Object.entries(row.__sub)) {
      const subPath = `${collectionPath}/${row.id}/${subName}`;
      await writeRows(subPath, subRows);
    }
  }
}

const files = readdirSync(FIRESTORE_DIR).filter(
  (f) => f.endsWith(".json") && !f.startsWith("_"),
);

console.log(
  `Importing ${files.length} collections from ${FIRESTORE_DIR} →`,
  admin.app().options.projectId ?? "<target>",
);
console.log("");

let totalDocs = 0;

for (const file of files) {
  const name = file.replace(/\.json$/, "");
  const rows = JSON.parse(readFileSync(join(FIRESTORE_DIR, file), "utf8"));
  process.stdout.write(`• ${name.padEnd(28, " ")} `);
  try {
    await writeRows(name, rows);
    totalDocs += rows.length;
    console.log(`${rows.length} docs`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

console.log(`\n✔ Done. Imported ${totalDocs} docs.`);
process.exit(0);
