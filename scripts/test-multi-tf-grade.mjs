#!/usr/bin/env node
/**
 * Soi bộ chấm câu Đúng–Sai nhiều ý (multi-tf) — apps/web/src/lib/exam/grade.ts.
 *
 * Chạy:  node scripts/test-multi-tf-grade.mjs
 *
 * Quy định của Bộ (đề tốt nghiệp THPT từ 2025), Phần II Đúng–Sai, câu 1 điểm:
 *   đúng 1 ý → 0,10đ · 2 ý → 0,25đ · 3 ý → 0,50đ · 4 ý → 1,00đ
 * Đây là chấm LŨY TIẾN, không phải chia đều, và tuyệt đối không phải
 * "sai một ý mất cả câu".
 *
 * File này kiểm cả ba tầng cùng lúc:
 *   1. tỉ lệ điểm từng câu (`gradeQuestionRatio`)
 *   2. cộng lên cả bài theo thang của đề (`computeWeightedAttemptScore`)
 *   3. hành vi khi đề KHÔNG có `scoringPolicy` — 36/42 đề đang sống rơi vào
 *      trường hợp này, nên nó không phải ca hiếm.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-mtf-")), "g.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/lib/exam/grade.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { gradeQuestionRatio, computeWeightedAttemptScore, computeAttemptScore } =
  await import(out);

// Bộ chấm THI THỬ — phải cho cùng con số với bộ chấm ca thi thật.
const outTrial = join(mkdtempSync(join(tmpdir(), "fsc-mtf2-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/exams/lib/grade.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${outTrial}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const MOET = { mcqMulti: "partial", ds: "graduated" };

/** Câu Đúng–Sai n ý, tất cả đáp án đúng là TRUE cho dễ dựng ca. */
const mtf = (n, id = "Q1") => ({
  id,
  type: "multi-tf",
  content: "Ngữ liệu",
  subQuestions: Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    statement: `Ý ${i + 1}`,
    correctAnswer: true,
  })),
});
/** Học sinh trả lời đúng k ý đầu, sai phần còn lại. */
const ans = (n, k) => ({
  kind: "multi-tf",
  values: Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`s${i + 1}`, i < k]),
  ),
});

/* ── 1. Bảng lũy tiến của Bộ, câu 4 ý ─────────────────────────────────── */
{
  const q = mtf(4);
  const mong = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 };
  for (let k = 0; k <= 4; k++) {
    const r = gradeQuestionRatio(q, ans(4, k), MOET);
    check(`4 ý · đúng ${k} ý → ${mong[k]}`, Math.abs(r - mong[k]) < 1e-9, `được ${r}`);
  }
}

/* ── 2. Quy ra điểm thật trên câu 1,00 điểm ───────────────────────────── */
{
  const q = mtf(4);
  for (const [k, diem] of [[1, 0.1], [2, 0.25], [3, 0.5], [4, 1]]) {
    const w = computeWeightedAttemptScore([q], { Q1: ans(4, k) }, () => 1, MOET);
    check(`câu 1,00đ · đúng ${k} ý → ${diem}đ`, Math.abs(w.points - diem) < 1e-9, `được ${w.points}`);
  }
}

/* ── 3. Câu KHÔNG phải 1 điểm vẫn giữ đúng tỉ lệ ──────────────────────── */
//
// Đề YCCĐ cho Phần II 2 điểm/câu là chuyện thường. Bảng của Bộ là điểm tuyệt
// đối cho câu 1 điểm, nên phải quy về tỉ lệ chứ không cộng thẳng 0,25.
{
  const q = mtf(4);
  const w = computeWeightedAttemptScore([q], { Q1: ans(4, 2) }, () => 2, MOET);
  check("câu 2,00đ · đúng 2 ý → 0,50đ (không phải 0,25)", Math.abs(w.points - 0.5) < 1e-9, `được ${w.points}`);
}

/* ── 4. Ý con TRỘN đúng/sai, không phải k ý đầu ───────────────────────── */
//
// Đúng 2 ý nhưng nằm rải rác — phải ra y hệt đúng 2 ý liền nhau.
{
  const q = {
    id: "Q1",
    type: "multi-tf",
    subQuestions: [
      { id: "s1", statement: "a", correctAnswer: true },
      { id: "s2", statement: "b", correctAnswer: false },
      { id: "s3", statement: "c", correctAnswer: true },
      { id: "s4", statement: "d", correctAnswer: false },
    ],
  };
  const a = { kind: "multi-tf", values: { s1: true, s2: true, s3: false, s4: false } };
  // đúng s1 và s4 → 2 ý
  check("đúng 2 ý rải rác → 0,25", Math.abs(gradeQuestionRatio(q, a, MOET) - 0.25) < 1e-9,
    String(gradeQuestionRatio(q, a, MOET)));
}

/* ── 5. Ý BỎ TRỐNG không được tính là đúng ────────────────────────────── */
{
  const q = {
    id: "Q1",
    type: "multi-tf",
    subQuestions: [
      { id: "s1", statement: "a", correctAnswer: false },
      { id: "s2", statement: "b", correctAnswer: false },
      { id: "s3", statement: "c", correctAnswer: false },
      { id: "s4", statement: "d", correctAnswer: false },
    ],
  };
  // Không trả lời ý nào. `undefined === false` là false → 0 ý đúng.
  const a = { kind: "multi-tf", values: {} };
  check(
    "bỏ trống hết (đáp án đều SAI) → 0 điểm, không phải trúng tủ 4 ý",
    gradeQuestionRatio(q, a, MOET) === 0,
    String(gradeQuestionRatio(q, a, MOET)),
  );
  // Trả lời đúng 2 ý, bỏ trống 2 ý.
  const b = { kind: "multi-tf", values: { s1: false, s2: false } };
  check("bỏ trống 2 ý, đúng 2 ý → 0,25", Math.abs(gradeQuestionRatio(q, b, MOET) - 0.25) < 1e-9);
}
check("không nộp gì cho câu Đúng–Sai → 0", gradeQuestionRatio(mtf(4), undefined, MOET) === 0);

/* ── 6. Số ý KHÁC 4 — dữ liệu thật có 2 ý và 3 ý ──────────────────────── */
//
// Ngân hàng đang có 30 câu multi-tf: 25 câu 4 ý, 2 câu 3 ý, 3 câu 2 ý.
// Bảng của Bộ chỉ định nghĩa cho 4 ý, nên số ý khác phải quy chuẩn — và
// điều KHÔNG được phép sai là: đúng HẾT thì phải trọn điểm.
for (const n of [2, 3, 4, 5, 6]) {
  const r = gradeQuestionRatio(mtf(n, `Q${n}`), ans(n, n), MOET);
  check(`${n} ý · đúng HẾT → trọn điểm (1.0)`, Math.abs(r - 1) < 1e-9, `được ${r}`);
}
for (const n of [2, 3, 5, 6]) {
  const r = gradeQuestionRatio(mtf(n, `Q${n}`), ans(n, n - 1), MOET);
  check(`${n} ý · sai đúng 1 ý → phải < trọn điểm và > 0`, r > 0 && r < 1, `được ${r}`);
}

/* ── 7. Chế độ trọng số từng ý ────────────────────────────────────────── */
{
  const q = {
    id: "Q1",
    type: "multi-tf",
    subQuestions: [
      { id: "s1", statement: "a", correctAnswer: true, weight: 3 },
      { id: "s2", statement: "b", correctAnswer: true, weight: 1 },
    ],
  };
  const P = { mcqMulti: "full", ds: "weighted" };
  check(
    "trọng số 3:1 · đúng ý nặng → 0,75",
    Math.abs(gradeQuestionRatio(q, { kind: "multi-tf", values: { s1: true, s2: false } }, P) - 0.75) < 1e-9,
  );
  check(
    "trọng số 3:1 · đúng ý nhẹ → 0,25",
    Math.abs(gradeQuestionRatio(q, { kind: "multi-tf", values: { s1: false, s2: true } }, P) - 0.25) < 1e-9,
  );
}

/* ── 8. Chế độ "trọn câu" là lựa chọn CÓ Ý THỨC, không phải mặc định ──── */
{
  const q = mtf(4);
  const P = { mcqMulti: "full", ds: "full" };
  check("ds=full · đúng 3/4 ý → 0", gradeQuestionRatio(q, ans(4, 3), P) === 0);
  check("ds=full · đúng 4/4 ý → 1", gradeQuestionRatio(q, ans(4, 4), P) === 1);
}

/* ── 9. Đề KHÔNG có scoringPolicy — 36/42 đề đang sống ────────────────── */
//
// Đây là câu hỏi trọng tâm: thiếu cấu hình thì hệ thống chấm kiểu gì?
{
  const q = mtf(4);
  const r3 = gradeQuestionRatio(q, ans(4, 3), null);
  console.log(`\n   [số đo] đề không có scoringPolicy · đúng 3/4 ý → ${r3}`);
  check(
    "KHÔNG có scoringPolicy · đúng 3/4 ý vẫn phải được 0,5 theo quy định Bộ",
    Math.abs(r3 - 0.5) < 1e-9,
    `đang là ${r3} — mất trắng câu`,
  );
  const r1 = gradeQuestionRatio(q, ans(4, 1), null);
  check(
    "KHÔNG có scoringPolicy · đúng 1/4 ý phải được 0,1",
    Math.abs(r1 - 0.1) < 1e-9,
    `đang là ${r1}`,
  );
}

/* ── 10. ĐƠN ĐIỆU: đúng nhiều ý hơn không bao giờ được ít điểm hơn ────── */
//
// Bất biến quan trọng nhất, và là bất biến từng bị vi phạm: câu 5 ý, đúng
// 4/5 được TRỌN ĐIỂM còn đúng 5/5 được 0. Làm kém hơn mà điểm cao hơn.
for (const n of [2, 3, 4, 5, 6, 8]) {
  let ok = true;
  let truoc = -1;
  const day = [];
  for (let k = 0; k <= n; k++) {
    const r = gradeQuestionRatio(mtf(n, `Q${n}`), ans(n, k), MOET);
    day.push(r);
    if (r < truoc - 1e-9) ok = false;
    truoc = r;
  }
  check(`${n} ý · thang điểm không giảm khi đúng thêm ý`, ok, day.join(" → "));
  check(`${n} ý · đúng 0 ý = 0, đúng hết = 1`, day[0] === 0 && Math.abs(day[n] - 1) < 1e-9, day.join(" → "));
}

/* ── 11. Hai bộ chấm phải cho CÙNG một con số ─────────────────────────── */
//
// Bộ chấm ca thi thật và bộ chấm thi thử từng là hai bản chép tay. Học sinh
// luyện đề thấy một điểm, thi thật ra điểm khác là mất niềm tin vào cả hệ
// thống — và không ai biết bên nào đúng.
{
  const { gradeQuestion: gradeTrial } = await import(outTrial);
  for (const n of [2, 3, 4, 5]) {
    for (let k = 0; k <= n; k++) {
      const q = mtf(n, `Q${n}`);
      const a = ans(n, k);
      const thi = gradeQuestionRatio(q, a, MOET);
      const thu = gradeTrial(q, a.values, MOET).score;
      check(
        `${n} ý · đúng ${k} · thi thật = thi thử`,
        Math.abs(thi - thu) < 1e-9,
        `thật ${thi} vs thử ${thu}`,
      );
    }
  }
}

/* ── 12. Điểm phần trăm (`score`) hiển thị trên báo cáo ───────────────── */
{
  const q = mtf(4);
  const s = computeAttemptScore([q], { Q1: ans(4, 3) });
  console.log(`   [số đo] computeAttemptScore · đúng 3/4 ý → score=${s.score}%`);
  check(
    "cột phần trăm cũng phải phản ánh lũy tiến (3/4 ý ≠ 0%)",
    s.score > 0,
    `đang là ${s.score}%`,
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
