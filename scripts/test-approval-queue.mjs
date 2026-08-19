#!/usr/bin/env node
/**
 * Test hồi quy cho luật "cái gì được nằm trong hàng đợi chờ duyệt"
 * (apps/web/src/features/question-bank/lib/approval-queue.ts).
 *
 * Chạy:  node scripts/test-approval-queue.mjs
 *
 * Vì sao có file này: trang Phê duyệt có ba tab (câu hỏi · học liệu · gói đề),
 * mỗi tab tự viết bộ lọc riêng. Tab Học liệu nhớ loại bản ĐÃ LƯU TRỮ, hai tab
 * kia quên.
 *
 * Đo trên dữ liệu thật: cơ sở FSC Đà Nẵng 3 có 63 câu kho chung, trong đó 21
 * câu vừa `archivedAt` vừa `status="pending"`. Ngân hàng câu hỏi ẩn câu đã lưu
 * trữ nên báo 21; màn Phê duyệt không ẩn nên báo 42. Hai con số cho cùng một
 * cơ sở, không biết tin cái nào.
 *
 * Nguy hơn con số: người duyệt vẫn bấm duyệt được câu đã xoá mềm, ra một câu
 * vừa "đã duyệt" vừa "đã lưu trữ" — lọt vào kho chung mà không ai chủ ý đưa.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-queue-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/approval-queue.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { inApprovalQueue, approvalQueue } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── 1. Luật lõi ───────────────────────────────────────────────────────── */
check("chưa lưu trữ → được vào hàng đợi", inApprovalQueue({ status: "pending" }) === true);
check(
  "ĐÃ lưu trữ → KHÔNG vào hàng đợi",
  inApprovalQueue({ status: "pending", archivedAt: "2026-08-19T07:08:59Z" }) === false,
);
check("archivedAt null = chưa lưu trữ", inApprovalQueue({ archivedAt: null }) === true);
check("thiếu hẳn trường archivedAt = chưa lưu trữ", inApprovalQueue({}) === true);
check(
  "archivedAt rỗng ('') tính là CHƯA lưu trữ",
  inApprovalQueue({ archivedAt: "" }) === true,
);

/* ── 2. Ca thật đã gây lệch số 21 vs 42 ────────────────────────────────── */
// FSC Đà Nẵng 3: 21 lưu trữ+duyệt, 21 lưu trữ+chờ duyệt, 21 sống+chờ duyệt.
{
  const mk = (n, over) => Array.from({ length: n }, (_, i) => ({ id: `Q${i}`, ...over }));
  const kho = [
    ...mk(21, { status: "approved", archivedAt: "2026-08-19T07:08:59Z" }),
    ...mk(21, { status: "pending", archivedAt: "2026-08-19T07:08:59Z" }),
    ...mk(21, { status: "pending" }),
  ];
  const queue = approvalQueue(kho);
  check("63 câu → hàng đợi chỉ còn 21 câu chưa lưu trữ", queue.length === 21, String(queue.length));
  check(
    "và đúng là 21 câu CHỜ DUYỆT còn sống",
    queue.filter((q) => q.status === "pending").length === 21,
  );
  check("không câu lưu trữ nào lọt", queue.every((q) => !q.archivedAt));

  // Đây là con số màn Phê duyệt hiện trước bản vá.
  const truocVa = kho.filter((q) => q.status === "pending").length;
  check("trước bản vá màn Duyệt đếm 42 — nay không còn", truocVa === 42 && queue.length !== truocVa);
}

/* ── 3. Áp cho MỌI loại, không riêng câu hỏi ───────────────────────────── */
// Ba tab dùng chung hàm này; tab nào quên là lại lệch số như cũ.
{
  const rows = [
    { id: "hoc-lieu", archivedAt: "2026-01-01T00:00:00Z" },
    { id: "goi-de" },
    { id: "cau-hoi", archivedAt: null },
  ];
  check(
    "lọc chung cho học liệu · gói đề · câu hỏi",
    approvalQueue(rows).map((r) => r.id).join() === "goi-de,cau-hoi",
    approvalQueue(rows).map((r) => r.id).join(),
  );
  check("danh sách rỗng → rỗng", approvalQueue([]).length === 0);
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
