#!/usr/bin/env node
/**
 * Test hồi quy: gộp mã câu hỏi từ khung đề KHÔNG được nổ vì dữ liệu lệch
 * (apps/web/src/features/grading/lib/utils.ts).
 *
 * Chạy:  node scripts/test-blueprint-picked.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Bản cũ viết thẳng trong JSX: `bp.topics.flatMap((t) => t.pickedQuestionIds)`.
 * Kiểu khai bảo hai trường đó luôn có nên `tsc` không bao giờ kêu — nhưng một
 * khung đề thiếu `topics` (dữ liệu cũ, ghi dở, di trú) làm `.flatMap` nổ ngay
 * giữa lúc dựng bảng ca thi.
 *
 * Nổ ở đó là chết CẢ trang /admin/shifts, không phải hỏng mỗi một dòng: người
 * vận hành thấy "Application error" trắng màn, không vào được ca thi nào,
 * không giám sát được, không phân công chấm được. /qa bắt được đúng lỗi này.
 *
 * Một bản ghi lệch không được phép khoá cả màn vận hành.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-bp-")), "u.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/grading/lib/utils.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { pickedQuestionIdsOf } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── Đường bình thường ───────────────────────────────────────────────── */
{
  const bp = {
    topics: [
      { topicId: "t1", pickedQuestionIds: ["Q-1", "Q-2"] },
      { topicId: "t2", pickedQuestionIds: ["Q-3"] },
    ],
  };
  const r = pickedQuestionIdsOf(bp);
  check("gộp đủ mã của mọi chủ điểm", eq(r, ["Q-1", "Q-2", "Q-3"]), JSON.stringify(r));
  check("giữ nguyên thứ tự", r[0] === "Q-1" && r[2] === "Q-3");
}

/* ── Dữ liệu lệch — đây mới là phần khoá ─────────────────────────────── */
{
  check("khung đề THIẾU `topics` → mảng rỗng, KHÔNG nổ", eq(pickedQuestionIdsOf({}), []));
  check("`topics` là null → mảng rỗng", eq(pickedQuestionIdsOf({ topics: null }), []));
  check("`topics` rỗng → mảng rỗng", eq(pickedQuestionIdsOf({ topics: [] }), []));
  check(
    "một chủ điểm thiếu `pickedQuestionIds` → bỏ qua, giữ phần còn lại",
    eq(pickedQuestionIdsOf({ topics: [{ topicId: "t1" }, { topicId: "t2", pickedQuestionIds: ["Q-9"] }] }), ["Q-9"]),
  );
  check(
    "`pickedQuestionIds` là null → bỏ qua",
    eq(pickedQuestionIdsOf({ topics: [{ pickedQuestionIds: null }] }), []),
  );
  check("phần tử chủ điểm là null → bỏ qua", eq(pickedQuestionIdsOf({ topics: [null, { pickedQuestionIds: ["Q-1"] }] }), ["Q-1"]));
  check("khung đề là null → mảng rỗng", eq(pickedQuestionIdsOf(null), []));
  check("khung đề undefined → mảng rỗng", eq(pickedQuestionIdsOf(undefined), []));
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
