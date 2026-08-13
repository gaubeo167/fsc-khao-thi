#!/usr/bin/env node
/**
 * Dựng/bồi bảng tra cứu đăng nhập `login_lookup/{username|studentCode}` → { email }.
 *
 * Chạy:  node scripts/backfill-login-lookup.mjs [--dry]
 *
 * Vì sao: trang đăng nhập phải đổi username / mã HS thành email TRƯỚC khi xác
 * thực. Trước đây việc đó dựa vào `allow read: if true` trên /users, khiến bất
 * kỳ ai trên internet tải được cả danh bạ học sinh kèm email + SĐT phụ huynh
 * qua REST API. Bảng này chỉ chứa email nên mở đọc công khai được.
 *
 * PHẢI chạy TRƯỚC khi deploy rules siết /users, nếu không tài khoản cũ (đăng
 * nhập bằng mã HS thay vì email tổng hợp) sẽ không vào được.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY = process.argv.includes("--dry");
const cred = JSON.parse(
  readFileSync(resolve(process.cwd(), "serviceAccount.json"), "utf8"),
);
initializeApp({ credential: cert(cred) });
const db = getFirestore();

const key = (s) => String(s).trim().toLowerCase().replace(/[/#?[\]]/g, "_");

const users = await db.collection("users").get();
let planned = 0;
let skipped = 0;
const batch = db.batch();
for (const d of users.docs) {
  const u = d.data();
  if (!u.email) {
    skipped++;
    continue;
  }
  for (const raw of [u.username, u.studentCode]) {
    if (!raw || !String(raw).trim()) continue;
    planned++;
    if (!DRY) {
      batch.set(db.collection("login_lookup").doc(key(raw)), { email: u.email });
    }
  }
}
if (!DRY && planned > 0) await batch.commit();
console.log(
  `${DRY ? "[DRY] " : ""}user=${users.size} · khoá tra cứu=${planned} · bỏ qua (không email)=${skipped}`,
);
