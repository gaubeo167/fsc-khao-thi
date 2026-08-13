#!/usr/bin/env node
/**
 * Test hồi quy cho bộ chấm theo THANG ĐIỂM CỦA ĐỀ (apps/web/src/lib/exam/grade.ts).
 *
 * Chạy:  node scripts/test-grade.mjs
 *
 * Vì sao có file này: điểm/câu của đề (đề YCCĐ chấm theo phần, Đúng–Sai lũy
 * tiến theo số ý đúng) từng bị bỏ qua hoàn toàn — máy chấm cho mỗi câu 1 điểm
 * rồi quy phần trăm. Các ca dưới khoá lại đúng hành vi MOET, và khoá cả hành
 * vi CŨ (không có policy → đúng hết mới có điểm) để đề khung không bị đổi.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-grade-")), "grade.mjs");
execFileSync(
  "npx",
  ["esbuild", "src/lib/exam/grade.ts", "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`],
  { cwd: "apps/web", stdio: "pipe" },
);
const { computeWeightedAttemptScore, gradeQuestionRatio } = await import(out);


let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = Math.abs(got - want) < 1e-9;
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}: ${got}${ok ? "" : ` (mong đợi ${want})`}`);
  ok ? pass++ : fail++;
};

const POLICY = { mcqMulti: "partial", ds: "graduated", dsGraduatedTable: { 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 } };
const FULL = { mcqMulti: "full", ds: "full" };

const ds = {
  id: "q-ds", type: "multi-tf",
  subQuestions: [
    { id: "a", statement: "", correctAnswer: true },
    { id: "b", statement: "", correctAnswer: false },
    { id: "c", statement: "", correctAnswer: true },
    { id: "d", statement: "", correctAnswer: false },
  ],
};
const ans = (v) => ({ kind: "multi-tf", values: v });
// Đúng–Sai 4 ý, câu 1 điểm → 0,1 / 0,25 / 0,5 / 1
eq("Đ–S đúng 1 ý", gradeQuestionRatio(ds, ans({ a: true, b: true, c: false, d: true }), POLICY), 0.1);
eq("Đ–S đúng 2 ý", gradeQuestionRatio(ds, ans({ a: true, b: false, c: false, d: true }), POLICY), 0.25);
eq("Đ–S đúng 3 ý", gradeQuestionRatio(ds, ans({ a: true, b: false, c: true, d: true }), POLICY), 0.5);
eq("Đ–S đúng 4 ý", gradeQuestionRatio(ds, ans({ a: true, b: false, c: true, d: false }), POLICY), 1);
eq("Đ–S sai hết", gradeQuestionRatio(ds, ans({ a: false, b: true, c: false, d: true }), POLICY), 0);
// HỒI QUY: policy "full" giữ nguyên hành vi cũ (đúng hết mới có điểm)
eq("Đ–S mode full · đúng 3 ý", gradeQuestionRatio(ds, ans({ a: true, b: false, c: true, d: true }), FULL), 0);
eq("Đ–S không có policy (đề khung)", gradeQuestionRatio(ds, ans({ a: true, b: false, c: true, d: true }), null), 0);

const mcq = {
  id: "q-mcq", type: "mcq-multi",
  options: [
    { id: "o1", content: "", isCorrect: true },
    { id: "o2", content: "", isCorrect: true },
    { id: "o3", content: "", isCorrect: false },
    { id: "o4", content: "", isCorrect: false },
  ],
};
const pick = (ids) => ({ kind: "mcq-multi", optionIds: ids });
eq("mcq-multi đúng 1/2", gradeQuestionRatio(mcq, pick(["o1"]), POLICY), 0.5);
eq("mcq-multi đúng 2/2", gradeQuestionRatio(mcq, pick(["o1", "o2"]), POLICY), 1);
eq("mcq-multi 2 đúng + 1 sai", gradeQuestionRatio(mcq, pick(["o1", "o2", "o3"]), POLICY), 0.5);
eq("mcq-multi tô hết", gradeQuestionRatio(mcq, pick(["o1", "o2", "o3", "o4"]), POLICY), 0);
eq("mcq-multi mode full · thiếu 1", gradeQuestionRatio(mcq, pick(["o1"]), FULL), 0);

// Cả bài theo thang đề: 2 mcq 0,25đ + 1 Đ–S 1đ = 1,5đ
const mcq1 = { id: "m1", type: "mcq-single", options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] };
const mcq2 = { id: "m2", type: "mcq-single", options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] };
const W = { m1: 0.25, m2: 0.25, "q-ds": 1 };
const r = computeWeightedAttemptScore(
  [mcq1, mcq2, ds],
  { m1: { kind: "mcq-single", optionId: "a" }, m2: { kind: "mcq-single", optionId: "b" }, "q-ds": ans({ a: true, b: false, c: true, d: true }) },
  (q) => W[q.id] ?? 0,
  POLICY,
);
eq("tổng điểm bài (0,25 + 0 + 0,5)", r.points, 0.75);
eq("tổng điểm tối đa", r.maxPoints, 1.5);
eq("điểm câu Đ–S đạt được", r.earnedPerQuestion["q-ds"], 0.5);
eq("số câu đúng trọn vẹn", r.correctCount, 1);

// Tự luận không tính vào điểm máy
const essay = { id: "e1", type: "essay", rubric: [] };
const r2 = computeWeightedAttemptScore([mcq1, essay], { m1: { kind: "mcq-single", optionId: "a" } }, (q) => (q.id === "m1" ? 0.25 : 2), POLICY);
eq("tự luận không vào maxPoints", r2.maxPoints, 0.25);
eq("số câu máy chấm", r2.autoGradedCount, 1);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
