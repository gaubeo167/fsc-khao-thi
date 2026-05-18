#!/usr/bin/env node
/**
 * List every /grades doc — diagnostic for duplicate / malformed
 * entries that show up twice in the UI.
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

const snap = await db.collection("grades").get();
if (snap.empty) {
  console.log("(no grades)");
  process.exit(0);
}
for (const d of snap.docs) {
  const data = d.data();
  console.log(
    `${d.id}`.padEnd(20),
    `| name=${(data.name ?? "—").padEnd(10)}`,
    `| code=${(data.code ?? "—").padEnd(6)}`,
    `| order=${data.order ?? "—"}`,
    `| status=${data.status ?? "—"}`,
  );
}
