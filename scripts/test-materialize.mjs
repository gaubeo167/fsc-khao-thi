#!/usr/bin/env node
/**
 * Test cho materializeExamForm — nơi ĐÓNG BĂNG điểm từng câu vào đề thi
 * (apps/web/src/features/exam-forms/lib/materialize.ts).
 *
 * Chạy:  node scripts/test-materialize.mjs
 *
 * VÌ SAO CÓ FILE NÀY
 *
 * materialize.ts trước nay KHÔNG có test nào, mà nó quyết định điểm tối đa của
 * từng câu trong mọi bài thi. Sai ở đây không ném lỗi, không cảnh báo, chỉ ra
 * điểm lệch — loại lỗi tệ nhất trong một hệ thống khảo thí.
 *
 * File này ra đời trước khi thêm chế độ "by-part" (điểm theo phần), đúng thứ
 * tự: dựng lưới an toàn cho ba chế độ đang chấm thật (even / by-difficulty /
 * manual) TRƯỚC, rồi mới sửa hàm.
 *
 * BẤT BIẾN QUAN TRỌNG NHẤT
 *
 *   Σ perQuestion  ==  scoring.maxScore
 *
 * Vỡ bất biến này nghĩa là đề 10 điểm chấm ra thang khác 10. Nhóm test cuối
 * kiểm đúng nó, và tài liệu ngay tại chỗ ghi rõ ca nào đang vỡ.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-mat-")), "m.mjs");
execFileSync(
  "npx",
  ["esbuild", "src/features/exam-forms/lib/materialize.ts", "--bundle",
   "--format=esm", "--platform=node", `--outfile=${out}`],
  { cwd: "apps/web", stdio: "pipe" },
);
const { materializeExamForm } = await import(out);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = typeof got === "number" && typeof want === "number"
    ? Math.abs(got - want) < 1e-9
    : JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}: ${JSON.stringify(got)}${ok ? "" : ` (mong đợi ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
};

/* ───────────────────────── Dụng cụ dựng đề ───────────────────────── */

/** Câu hỏi tối giản — chỉ những trường materialize thật sự đọc. */
const q = (id, difficulty, type = "mcq-single") => ({
  id,
  type,
  difficulty,
  content: `Nội dung ${id}`,
  options: [
    { id: "a", content: "A", isCorrect: true },
    { id: "b", content: "B", isCorrect: false },
  ],
  subjectId: "subject-math",
  gradeId: "grade-10",
  status: "approved",
  kho: "campus",
});

/** Dựng bộ đầu vào cho materializeExamForm với một mạch duy nhất. */
function makeInput({ pool, easy = 0, medium = 0, hard = 0, scoring }) {
  const topicId = "topic-1";
  return {
    shiftId: "SHIFT-TEST",
    campusId: "campus-cau-giay",
    blueprint: {
      id: "BP-TEST",
      name: "Khung đề test",
      subjectId: "subject-math",
      gradeId: "grade-10",
      duration: 45,
      topics: [{ id: topicId, name: "Mạch 1", pickedQuestionIds: pool.map((x) => x.id) }],
    },
    pkg: {
      id: "PKG-TEST",
      name: "Gói đề test",
      blueprintId: "BP-TEST",
      duration: 45,
      campusId: "campus-cau-giay",
      ownerId: "U-301",
      ownerName: "GV Test",
      matrix: [{ topicId, easyCount: easy, mediumCount: medium, hardCount: hard }],
      status: "approved",
    },
    questionPool: pool,
    variantCount: 1,
    scoring,
    actorUid: "U-301",
    formId: "FORM-TEST",
    now: "2026-08-14T00:00:00.000Z",
    orderStrategy: "shuffle-all",
  };
}

/** Chạy materialize và trả về mảng điểm từng câu của đề đầu tiên. */
function pointsOf(input) {
  const form = materializeExamForm(input);
  const v = form.variants[0];
  return v.questions.map((s) => v.perQuestion[s.snapshotId]);
}

const sum = (a) => a.reduce((n, x) => n + x, 0);

/* ══════════════ NHÓM 1 — KHOÁ HÀNH VI 3 CHẾ ĐỘ ĐANG CHẤM THẬT ══════════════
 * Nhóm này phải XANH trên code CHƯA sửa. Đó là điều kiện để gọi nó là test
 * hồi quy: nó mô tả hiện trạng, nên khi thêm "by-part" mà nó đỏ thì biết ngay
 * là đã làm hỏng thứ đang chạy.
 */
console.log("── Nhóm 1: khoá hành vi 3 chế độ hiện có ──");

// even: 4 câu, thang 10 → mỗi câu 2,5
{
  const pool = [q("Q1", "easy"), q("Q2", "easy"), q("Q3", "medium"), q("Q4", "medium")];
  const pts = pointsOf(makeInput({ pool, easy: 2, medium: 2, scoring: { maxScore: 10, mode: "even" } }));
  eq("even · 4 câu / thang 10 → 2,5đ mỗi câu", pts, [2.5, 2.5, 2.5, 2.5]);
}

// even: thang 100
{
  const pool = [q("Q1", "easy"), q("Q2", "easy")];
  const pts = pointsOf(makeInput({ pool, easy: 2, scoring: { maxScore: 100, mode: "even" } }));
  eq("even · 2 câu / thang 100 → 50đ mỗi câu", pts, [50, 50]);
}

// by-difficulty: ĐÚNG ca trong ảnh người dùng gửi (2 dễ + 4 TB + 0 khó, thang 10,
// trọng số mặc định 1 / 1,5 / 2). Giao diện hiện "1.25đ" và "1.88đ".
{
  const pool = [
    q("Q1", "easy"), q("Q2", "easy"),
    q("Q3", "medium"), q("Q4", "medium"), q("Q5", "medium"), q("Q6", "medium"),
  ];
  const pts = pointsOf(makeInput({
    pool, easy: 2, medium: 4,
    scoring: { maxScore: 10, mode: "by-difficulty", difficultyWeights: { easy: 1, medium: 1.5, hard: 2 } },
  }));
  const easyPts = pts.filter((p) => p === 1.25).length;
  const medPts = pts.filter((p) => p === 1.88).length;
  eq("by-difficulty · 2 câu dễ nhận 1,25đ", easyPts, 2);
  eq("by-difficulty · 4 câu TB nhận 1,88đ (đã làm tròn từ 1,875)", medPts, 4);
}

// manual: điểm do giáo viên tự đặt, tổng đã đúng thang → giữ nguyên
{
  const pool = [q("Q1", "easy"), q("Q2", "medium")];
  const pts = pointsOf(makeInput({
    pool, easy: 1, medium: 1,
    scoring: { maxScore: 10, mode: "manual", perQuestion: { Q1: 3, Q2: 7 } },
  }));
  eq("manual · tổng đã đúng thang → giữ nguyên", sum(pts), 10);
  eq("manual · giữ đúng hai giá trị đã đặt", [...pts].sort((a, b) => a - b), [3, 7]);
}

// manual: tổng lệch thang → có đường chuẩn hoá lại theo tỉ lệ
{
  const pool = [q("Q1", "easy"), q("Q2", "medium")];
  const pts = pointsOf(makeInput({
    pool, easy: 1, medium: 1,
    scoring: { maxScore: 10, mode: "manual", perQuestion: { Q1: 2, Q2: 3 } },
  }));
  eq("manual · tổng 5 bị kéo về đúng thang 10", sum(pts), 10);
}

/* ══════════════ NHÓM 2 — BẤT BIẾN Σ perQuestion == maxScore ══════════════
 * Đây là thứ đáng test nhất và cũng là thứ ĐANG VỠ trong code hiện tại.
 * Ghi rõ ca nào vỡ để không ai tưởng test hỏng.
 */
console.log("\n── Nhóm 2: bất biến tổng điểm ──");

// Chia hết → khớp tuyệt đối.
{
  const pool = [q("Q1", "easy"), q("Q2", "easy"), q("Q3", "easy"), q("Q4", "easy"), q("Q5", "easy")];
  const pts = pointsOf(makeInput({ pool, easy: 5, scoring: { maxScore: 10, mode: "even" } }));
  eq("even · 5 câu chia hết → tổng đúng 10", sum(pts), 10);
}

// KHÔNG chia hết. 10 / 3 = 3,3333 → round2 → 3,33 → tổng 9,99.
{
  const pool = [q("Q1", "easy"), q("Q2", "easy"), q("Q3", "easy")];
  const pts = pointsOf(makeInput({ pool, easy: 3, scoring: { maxScore: 10, mode: "even" } }));
  // ĐANG SAI: 10/3 = 3,3333 bị round2 thành 3,33 → tổng 9,99.
  // Ghi nhận hiện trạng ở commit này; commit sau sửa thành 10 tròn.
  eq("even · 3 câu — HIỆN TRẠNG tổng 9,99 (SAI, sửa ở commit sau)", sum(pts), 9.99);
}

// by-difficulty, đúng ca trong ảnh. 2×1,25 + 4×1,88 = 10,02.
{
  const pool = [
    q("Q1", "easy"), q("Q2", "easy"),
    q("Q3", "medium"), q("Q4", "medium"), q("Q5", "medium"), q("Q6", "medium"),
  ];
  const pts = pointsOf(makeInput({
    pool, easy: 2, medium: 4,
    scoring: { maxScore: 10, mode: "by-difficulty", difficultyWeights: { easy: 1, medium: 1.5, hard: 2 } },
  }));
  // ĐANG SAI: 10×1,5/8 = 1,875 bị round2 thành 1,88 → tổng 10,02.
  // Đây đúng là cấu hình trong ảnh chụp màn hình người dùng gửi.
  eq("by-difficulty · ca trong ảnh — HIỆN TRẠNG tổng 10,02 (SAI, sửa ở commit sau)", sum(pts), 10.02);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
