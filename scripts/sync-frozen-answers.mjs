#!/usr/bin/env node
/**
 * Dò và vá những câu trong đề ĐANG SỐNG có đáp án lệch với ngân hàng.
 *
 *   node scripts/sync-frozen-answers.mjs                      # chỉ dò, không sửa
 *   node scripts/sync-frozen-answers.mjs --apply              # vá tất cả
 *   node scripts/sync-frozen-answers.mjs --question Q-0084    # giới hạn 1 câu
 *   node scripts/sync-frozen-answers.mjs --shift SHIFT-0048   # giới hạn 1 ca
 *   node scripts/sync-frozen-answers.mjs --answers-only       # không chép đề bài
 *
 * Vì sao cần: đề thi đóng băng vào `exam_forms`, và cả route phục vụ câu hỏi
 * cho học sinh lẫn route chấm bài đều đọc bản đóng băng đó. Sửa câu trong
 * ngân hàng không với tới. Nên mọi lần sửa đáp án TRƯỚC khi có nút đồng bộ
 * đều đang nằm lệch — ca thi vẫn chấm bằng đáp án cũ.
 *
 * Mặc định là DÒ KHÔNG SỬA. Đọc kỹ danh sách rồi mới chạy --apply.
 *
 * KHÔNG đụng tới bài đã nộp: điểm đã chấm chỉ đổi qua nút "Chấm lại ca thi"
 * (có ghi lý do, có lưu lịch sử). Script này chỉ sửa cái đề mà những lượt
 * thi tiếp theo sẽ đọc.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = has("--apply");
const ONLY_QUESTION = val("--question");
const ONLY_SHIFT = val("--shift");
const SYNC_CONTENT = !has("--answers-only");

// Dùng ĐÚNG hàm mà máy chủ dùng — viết lại luật ở đây là mở đường cho hai
// luật lệch nhau.
const out = join(mkdtempSync(join(tmpdir(), "fsc-syncfrozen-")), "r.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/lib/exam/refresh-frozen.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { refreshFrozenQuestion, bankIdOfSnapshot } = await import(out);

initializeApp({
  credential: cert(JSON.parse(readFileSync("serviceAccount.json", "utf8"))),
});
const db = getFirestore();

console.log(
  APPLY
    ? "⚠  CHẾ ĐỘ VÁ THẬT — sẽ ghi vào exam_forms\n"
    : "🔍 Chỉ dò, không sửa gì. Thêm --apply để vá.\n",
);

const formsSnap = await db
  .collection("exam_forms")
  .where("lifecycle", "==", "active")
  .get();
console.log(`Đề đang sống: ${formsSnap.size}`);

/** Cache câu hỏi trong ngân hàng. */
const bank = new Map();
async function getBank(id) {
  if (bank.has(id)) return bank.get(id);
  const s = await db.collection("questions").doc(id).get();
  const v = s.exists ? { ...s.data(), id: s.id } : null;
  bank.set(id, v);
  return v;
}

let formsWithDrift = 0;
let questionsWithDrift = 0;
let formsPatched = 0;
let missingInBank = 0;

for (const doc of formsSnap.docs) {
  const form = doc.data();
  if (ONLY_SHIFT && form.shiftId !== ONLY_SHIFT) continue;

  const drift = [];
  let touched = false;
  const nextVariants = [];

  for (const v of form.variants ?? []) {
    const nextQuestions = [];
    for (const q of v.questions ?? []) {
      const bankId = bankIdOfSnapshot(q);
      if (ONLY_QUESTION && bankId !== ONLY_QUESTION) {
        nextQuestions.push(q);
        continue;
      }
      const live = await getBank(bankId);
      if (!live) {
        missingInBank += 1;
        nextQuestions.push(q);
        continue;
      }
      const res = refreshFrozenQuestion(q, live, { syncContent: SYNC_CONTENT });
      if (!res.changed) {
        nextQuestions.push(q);
        continue;
      }
      touched = true;
      drift.push({
        variantId: v.variantId,
        bankId,
        structureChanged: res.structureChanged,
      });
      nextQuestions.push(res.next);
    }
    nextVariants.push({ ...v, questions: nextQuestions });
  }

  if (!touched) continue;
  formsWithDrift += 1;
  questionsWithDrift += drift.length;

  console.log(`\n${doc.id}  (ca ${form.shiftId ?? "—"})`);
  for (const d of drift) {
    console.log(
      `   mã đề ${d.variantId ?? "?"} · câu ${d.bankId}${d.structureChanged ? "  ⚠ tập phương án đổi → mất thứ tự trộn" : ""}`,
    );
  }

  if (APPLY) {
    await doc.ref.update({
      variants: nextVariants,
      updatedAt: new Date().toISOString(),
      lastSyncedFromBank: {
        at: new Date().toISOString(),
        by: "script:sync-frozen-answers",
        reason: "Dò lệch đáp án giữa ngân hàng và đề đã đóng băng",
      },
    });
    formsPatched += 1;
  }
}

console.log(
  `\n── Tổng kết ──────────────────────────────────────────────────\n` +
    `Đề lệch          : ${formsWithDrift}\n` +
    `Câu lệch         : ${questionsWithDrift}\n` +
    `Không thấy ở kho : ${missingInBank}\n` +
    `Đã vá            : ${formsPatched}`,
);
if (!APPLY && formsWithDrift > 0) {
  console.log(`\nChạy lại với --apply để vá.`);
}
if (APPLY && formsPatched > 0) {
  console.log(
    `\nLượt thi TỪ GIỜ dùng đáp án mới.\n` +
      `Bài ĐÃ NỘP vẫn giữ điểm cũ — vào ca thi bấm "Chấm lại ca thi" nếu cần.`,
  );
}
process.exit(0);
