#!/usr/bin/env node
/**
 * List every student account — email, username, mã HS, campusId.
 * Used to find the right email to pass to dump-user / reset-password.
 *
 * Usage:
 *   node scripts/list-students.mjs
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

const snap = await db.collection("users").where("role", "==", "student").get();
if (snap.empty) {
  console.log("(no students)");
  process.exit(0);
}
for (const d of snap.docs) {
  const data = d.data();
  console.log(
    `uid=${d.id}`.padEnd(38),
    `| email=${(data.email ?? "—").padEnd(30)}`,
    `| username=${(data.username ?? "—").padEnd(15)}`,
    `| studentCode=${(data.studentCode ?? "—").padEnd(20)}`,
    `| name=${data.name ?? "—"}`,
  );
}
