#!/usr/bin/env node
/**
 * Print every campus doc's id / tier / gradeIds — diagnostic helper.
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

const snap = await db.collection("campuses").get();
if (snap.empty) {
  console.log("(no campuses)");
  process.exit(0);
}
for (const d of snap.docs) {
  const data = d.data();
  console.log(
    `${d.id}`,
    `| tier=${data.tier ?? "—"}`,
    `| gradeIds=${JSON.stringify(data.gradeIds ?? [])}`,
    `| name=${data.name ?? "—"}`,
  );
}
