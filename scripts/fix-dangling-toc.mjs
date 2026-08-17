#!/usr/bin/env node
/**
 * Gỡ con trỏ mục lục ĐÃ CHẾT khỏi câu hỏi.
 *
 * Chạy:  node scripts/fix-dangling-toc.mjs            (chỉ xem, không ghi)
 *        node scripts/fix-dangling-toc.mjs --apply    (ghi thật)
 *        node scripts/fix-dangling-toc.mjs --subject subject-1 --apply
 *
 * Vì sao cần: xoá một node mục lục trước đây KHÔNG dọn tham chiếu trên câu
 * hỏi (bản vá chặn việc đó chỉ mới có gần đây). Hậu quả: câu hỏi mang một
 * `tocNodeId` trỏ vào node không còn tồn tại — nhìn thì "đã gắn mục lục",
 * mà mở mục lục ra không thấy đâu, và bộ lọc theo mục lục cũng không ra.
 *
 * Đo trên production: 44 câu Toán khối 1 (Đà Nẵng) trỏ vào toc-11 và toc-83,
 * hai node đã bị xoá từ lâu.
 *
 * Đặt về null là KHÔNG mất gì: con trỏ đó vốn đã vô nghĩa. Sau khi gỡ, câu
 * hiện lên trong dải "chưa gắn mục lục" ở màn Mục lục để người dùng gắn lại
 * đúng chương.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const sIdx = process.argv.indexOf("--subject");
const onlySubject = sIdx >= 0 ? process.argv[sIdx + 1] : null;

initializeApp({
  credential: cert(JSON.parse(readFileSync("serviceAccount.json", "utf8"))),
});
const db = getFirestore();

const [toc, qs, subs] = await Promise.all([
  db.collection("toc_nodes").get(),
  db.collection("questions").get(),
  db.collection("subjects").get(),
]);
const alive = new Set(toc.docs.map((d) => d.id));
const subName = new Map(subs.docs.map((d) => [d.id, d.data().name]));

const broken = qs.docs.filter((d) => {
  const q = d.data();
  if (!q.tocNodeId || alive.has(q.tocNodeId)) return false;
  return !onlySubject || q.subjectId === onlySubject;
});

const bySubject = {};
for (const d of broken) {
  const q = d.data();
  const k = `${q.subjectId} (${subName.get(q.subjectId) ?? "?"}) · ${q.gradeId}`;
  bySubject[k] = (bySubject[k] ?? 0) + 1;
}
console.log(`Câu hỏi trỏ vào node mục lục đã xoá: ${broken.length}`);
for (const [k, v] of Object.entries(bySubject)) console.log(`  ${v} câu · ${k}`);

if (!apply) {
  console.log("\n(chỉ xem — thêm --apply để ghi thật)");
  process.exit(0);
}
if (broken.length === 0) process.exit(0);

// Ghi theo lô: Firestore giới hạn 500 thao tác một batch.
let done = 0;
for (let i = 0; i < broken.length; i += 400) {
  const batch = db.batch();
  for (const d of broken.slice(i, i + 400)) {
    batch.update(d.ref, {
      tocNodeId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  done += Math.min(400, broken.length - i);
  console.log(`  đã gỡ ${done}/${broken.length}`);
}
console.log("Xong. Mở màn Mục lục để gắn lại — chúng nằm trong dải 'chưa gắn mục lục'.");
process.exit(0);
