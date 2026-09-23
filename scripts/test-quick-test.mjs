#!/usr/bin/env node
/**
 * Test hồi quy: BÀI KIỂM TRA giáo viên tự ra (BKT).
 *
 * Chạy:  node scripts/test-quick-test.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * BKT dùng CHUNG bản ghi với ca thi, chỉ khác một trường `kind: "test"`.
 * Dùng chung là cố ý (giám sát, chấm bài, báo cáo khỏi viết lại), nhưng nó
 * đẻ ra đúng ba chỗ dễ gãy, và cả ba đều gãy im lặng:
 *
 *   1. `isQuickTest` đọc nhầm dữ liệu CŨ. Hàng nghìn ca thi trong Firestore
 *      không có trường `kind`. Nếu thiếu `kind` mà bị coi là bài kiểm tra thì
 *      toàn bộ lịch thi của trường biến khỏi màn ca thi và rơi sang màn BKT.
 *
 *   2. Đề đóng băng ra sai. BKT không có gói đề/ma trận, nên `materializeQuickForm`
 *      là đường riêng — nhưng điểm từng câu, mã băm toàn vẹn và ảnh chụp câu
 *      hỏi phải giống hệt ca thi, nếu không một bài kiểm tra chấm ra điểm khác
 *      một ca thi cùng nội dung.
 *
 *   3. Danh sách học sinh của lớp. BKT giao cho CẢ LỚP, mà hồ sơ /users đã đi
 *      qua ba hình dạng (`classIds`, `className`, `class.studentIds`) và cả ba
 *      còn sống. Chỉ đọc `classIds` là "giao bài cho lớp mà nửa lớp không thấy
 *      bài" — lỗi đã từng xảy ra ở BTVN.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-bkt-"));
function bundle(src, name) {
  const out = join(dir, name);
  execFileSync(
    "npx",
    [
      "esbuild",
      src,
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--alias:@=./src",
      `--outfile=${out}`,
    ],
    { cwd: "apps/web", stdio: "pipe" },
  );
  return out;
}

const { materializeQuickForm } = await import(
  bundle("src/features/exam-forms/lib/materialize.ts", "m.mjs")
);
const { isQuickTest } = await import(
  bundle("src/features/exam-shifts/data/types.ts", "t.mjs")
);
const { studentsOfClass, rosterForClasses } = await import(
  bundle("src/lib/roster.ts", "r.mjs")
);
const { shiftQuestionPoolIds } = await import(
  bundle("src/features/exam-shifts/lib/question-pool.ts", "p.mjs")
);
const { buildShiftReport } = await import(
  bundle("src/features/reports/lib/compute-stats.ts", "s.mjs")
);

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ───────────────────────────── 1. isQuickTest ─────────────────────────────
console.log("\nisQuickTest — dữ liệu cũ không có `kind`");
check("thiếu kind = CA THI (không phải bài kiểm tra)", !isQuickTest({}));
check("kind: undefined = ca thi", !isQuickTest({ kind: undefined }));
check('kind: "exam" = ca thi', !isQuickTest({ kind: "exam" }));
check('kind: "test" = bài kiểm tra', isQuickTest({ kind: "test" }));

// ──────────────────────── 2. materializeQuickForm ────────────────────────
console.log("\nmaterializeQuickForm — đóng băng đề bài kiểm tra");

const mkQuestion = (i) => ({
  id: `q${i}`,
  type: "mcq-single",
  content: `Câu ${i}`,
  stem: `Câu ${i}`,
  options: [
    { id: "o1", content: "A", isCorrect: i % 2 === 0 },
    { id: "o2", content: "B", isCorrect: i % 2 !== 0 },
  ],
  difficulty: "medium",
  subjectId: "sub-toan",
  gradeId: "k10",
  campusId: "cs-caugiay",
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "gv1",
});

const questions = Array.from({ length: 5 }, (_, i) => mkQuestion(i + 1));
const base = {
  shiftId: "shift-1",
  campusId: "cs-caugiay",
  questions,
  variantCount: 1,
  scoring: { maxScore: 10, mode: "even" },
  durationMinutes: 15,
  actorUid: "gv1",
  formId: "form-1",
  now: "2026-02-01T00:00:00.000Z",
};

const form = materializeQuickForm(base);
const v0 = form.variants[0];

check("1 mã đề → 1 biến thể", form.variants.length === 1);
check("đủ số câu giáo viên chọn", v0.questions.length === 5, `${v0.questions.length}`);
check(
  "mã đề 1 giữ NGUYÊN thứ tự giáo viên chọn",
  v0.questions.map((q) => q.originalQuestionId).join(",") === "q1,q2,q3,q4,q5",
);
check(
  'orderStrategy = "as-authored" (làm bài không đảo lại lần nữa)',
  form.orderStrategy === "as-authored",
);
check("có mã băm toàn vẹn", typeof form.integrityHash === "string" && form.integrityHash.length > 0);
check("thời gian làm bài đi thẳng vào đề", form.durationMinutes === 15);
check("maxScore đi thẳng vào đề", form.maxScore === 10);

const sum = Object.values(v0.perQuestion).reduce((a, b) => a + b, 0);
check("Σ điểm từng câu = maxScore", Math.abs(sum - 10) < 1e-9, `${sum}`);
check(
  "điểm khoá theo snapshotId, không phải id câu gốc",
  v0.questions.every((q) => typeof v0.perQuestion[q.snapshotId] === "number"),
);

// Ảnh chụp phải là BẢN SAO: sửa câu gốc sau đó không được đổi đề đã đóng băng.
questions[0].stem = "ĐÃ SỬA SAU KHI ĐÓNG BĂNG";
check(
  "ảnh chụp câu hỏi là bản sao sâu",
  v0.questions[0].stem === "Câu 1",
  v0.questions[0].stem,
);
questions[0].stem = "Câu 1";

// Nhiều mã đề: đảo thứ tự ngay lúc đóng băng, không đảo lúc làm bài.
const multi = materializeQuickForm({ ...base, variantCount: 3, formId: "form-2" });
check("3 mã đề → 3 biến thể", multi.variants.length === 3);
check(
  "mọi mã đề đều đủ câu",
  multi.variants.every((v) => v.questions.length === 5),
);
check(
  "mã đề có id riêng",
  new Set(multi.variants.map((v) => v.variantId)).size === 3,
);
check(
  "mọi mã đề đều chứa ĐỦ 5 câu gốc (đảo chứ không bỏ câu)",
  multi.variants.every(
    (v) =>
      new Set(v.questions.map((q) => q.originalQuestionId)).size === 5,
  ),
);

// Điểm thủ công: khoá theo id câu GỐC vì giáo viên chấm trên id sống.
const manual = materializeQuickForm({
  ...base,
  formId: "form-3",
  scoring: {
    maxScore: 10,
    mode: "manual",
    perQuestion: { q1: 4, q2: 3, q3: 1, q4: 1, q5: 1 },
  },
});
const mv = manual.variants[0];
const q1snap = mv.questions.find((q) => q.originalQuestionId === "q1");
check("điểm thủ công theo id câu gốc → đúng câu", mv.perQuestion[q1snap.snapshotId] === 4);
check(
  "Σ điểm thủ công = maxScore",
  Math.abs(Object.values(mv.perQuestion).reduce((a, b) => a + b, 0) - 10) < 1e-9,
);

// Bài kiểm tra rỗng phải NỔ, không được lặng lẽ tạo đề 0 câu.
let threw = false;
try {
  materializeQuickForm({ ...base, questions: [], formId: "form-4" });
} catch {
  threw = true;
}
check("0 câu → báo lỗi, không tạo đề rỗng", threw);

// ───────────────────────── 3. danh sách lớp ──────────────────────────────
console.log("\nstudentsOfClass — ba hình dạng hồ sơ cùng sống");

const cls = { id: "c-10a1", name: "10A1", code: "10A1", studentIds: ["hs-cu"] };
const users = [
  { id: "hs-moi", name: "Bình", role: "student", classIds: ["c-10a1"] },
  { id: "hs-ten-lop", name: "An", role: "student", className: "10a1" },
  { id: "hs-cu", name: "Cường", role: "student" },
  { id: "hs-lop-khac", name: "Dũng", role: "student", classIds: ["c-10a2"] },
  { id: "gv", name: "Cô Hà", role: "teacher", classIds: ["c-10a1"] },
];
const roster = studentsOfClass(cls, users);
const ids = roster.map((s) => s.id).sort();

check("lấy theo classIds", ids.includes("hs-moi"));
check("lấy theo className (khớp không phân biệt hoa thường)", ids.includes("hs-ten-lop"));
check("lấy theo class.studentIds đời đầu", ids.includes("hs-cu"));
check("KHÔNG lấy học sinh lớp khác", !ids.includes("hs-lop-khac"));
check("KHÔNG lấy giáo viên", !ids.includes("gv"));
check("không trùng lặp", new Set(ids).size === ids.length);
check(
  "sắp theo tên tiếng Việt",
  roster.map((s) => s.name).join(",") === "An,Bình,Cường",
  roster.map((s) => s.name).join(","),
);

const both = studentsOfClass(
  { id: "c-10a1", name: "10A1", studentIds: ["hs-moi"] },
  [{ id: "hs-moi", name: "Bình", role: "student", classIds: ["c-10a1"] }],
);
check("hồ sơ khớp cả hai đường chỉ đếm MỘT lần", both.length === 1);

const multiClass = rosterForClasses(["c-10a1", "c-khong-ton-tai"], [cls], users);
check("giữ nguyên thứ tự lớp được chọn", multiClass.length === 1);
check("lớp không tồn tại thì bỏ qua, không nổ", multiClass[0].classId === "c-10a1");
check("lớp trống/không tồn tại không sinh hàng rỗng", multiClass[0].students.length === 3);

// ───────────── 4. Câu của ca: khung đề HAY danh sách trên ca ─────────────
console.log("\nshiftQuestionPoolIds — báo cáo phải biết ca gồm câu nào");

const bpFull = { topics: [{ pickedQuestionIds: ["a", "b"] }, { pickedQuestionIds: ["c"] }] };
check("ca thi: lấy từ khung đề", shiftQuestionPoolIds({}, bpFull).join(",") === "a,b,c");
check(
  "bài kiểm tra (không khung đề): lấy từ danh sách trên ca",
  shiftQuestionPoolIds({ questionIds: ["q1", "q2"] }, null).join(",") === "q1,q2",
);
check(
  "khung đề rỗng cũng rơi về danh sách trên ca",
  shiftQuestionPoolIds({ questionIds: ["q1"] }, { topics: [] }).join(",") === "q1",
);
check("không có gì thì rỗng, không nổ", shiftQuestionPoolIds({}, null).length === 0);
check(
  "khung đề méo (topics thiếu trường) không làm sập",
  shiftQuestionPoolIds({ questionIds: ["q1"] }, { topics: [{}] }).join(",") === "q1",
);

// Lỗi thật đã gặp: bài kiểm tra chấm đúng 1/3 câu nhưng màn Kết quả ra 0 điểm,
// vì danh sách câu dựng từ khung đề nên rỗng.
console.log("\nbuildShiftReport — bài kiểm tra KHÔNG được ra 0 điểm oan");
const reportQs = [mkQuestion(1), mkQuestion(2), mkQuestion(3)];
const correctOf = (q) => q.options.find((o) => o.isCorrect).id;
const shiftRow = {
  id: "shift-1",
  name: "KT 15 phút",
  subjectId: "sub-toan",
  gradeId: "k10",
  classIds: ["c-10a1"],
  campusId: "cs-caugiay",
  kind: "test",
  questionIds: ["q1", "q2", "q3"],
  rooms: [{ id: "r1", name: "Cả lớp", studentIds: ["hs1"], proctorIds: [] }],
  scoring: { maxScore: 10, mode: "even" },
  startAt: "2026-02-01T01:00:00.000Z",
  endAt: "2026-02-01T02:00:00.000Z",
  status: "completed",
};
const attempt = {
  id: "att-1",
  shiftId: "shift-1",
  studentId: "hs1",
  questionIds: ["q1", "q2", "q3"],
  answers: {
    q1: { kind: "mcq-single", optionId: correctOf(reportQs[0]) },
    q2: { kind: "mcq-single", optionId: "sai" },
    q3: { kind: "mcq-single", optionId: "sai" },
  },
  startedAt: "2026-02-01T01:00:00.000Z",
  submittedAt: "2026-02-01T01:10:00.000Z",
  violations: { tabSwitches: 0, fullscreenExits: 0, pasteAttempts: 0 },
};
const pool = shiftQuestionPoolIds(shiftRow, null)
  .map((id) => reportQs.find((q) => q.id === id))
  .filter(Boolean);
const rep = buildShiftReport({
  shift: shiftRow,
  attempts: [attempt],
  questions: pool,
  essayGrades: [],
  eligible: 1,
});
check("đếm đúng 1 bài đã nộp", rep.totals.submitted === 1);
check(
  "đúng 1/3 câu → ~3.33 điểm, KHÔNG phải 0",
  Math.abs(rep.totals.avgRaw - 3.33) < 0.02,
  String(rep.totals.avgRaw),
);
check("phần trăm ~33%", Math.abs(rep.totals.avgPercent - 33) <= 1, String(rep.totals.avgPercent));

console.log(`\n${pass} đạt, ${fail} hỏng`);
process.exit(fail === 0 ? 0 : 1);
