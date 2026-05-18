#!/usr/bin/env node
/**
 * List every /subjects doc — diagnostic for duplicate / missing-field
 * entries that show up wrong in the UI.
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

const snap = await db.collection("subjects").get();
if (snap.empty) {
  console.log("(no subjects)");
  process.exit(0);
}
for (const d of snap.docs) {
  const data = d.data();
  console.log(
    `${d.id}`.padEnd(28),
    `| name=${(data.name ?? "—").padEnd(14)}`,
    `| code=${(data.code ?? "—").padEnd(6)}`,
    `| campusIds=${JSON.stringify(data.campusIds ?? [])}`,
    `| gradeIds.len=${(data.gradeIds ?? []).length}`,
    `| status=${data.status ?? "—"}`,
  );
}
