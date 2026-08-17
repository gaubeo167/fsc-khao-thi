#!/usr/bin/env node
/**
 * Test hồi quy cho việc đẩy câu đã sửa vào đề đang đóng băng
 * (apps/web/src/lib/exam/refresh-frozen.ts).
 *
 * Chạy:  node scripts/test-refresh-frozen.mjs
 *
 * Vì sao có file này: đề thi đóng băng vào `exam_forms`, và CẢ HAI đầu đều
 * đọc bản đóng băng — route phục vụ câu hỏi cho học sinh lẫn route chấm bài.
 * Sửa đáp án trong ngân hàng không với tới đó, nên ca thi đang diễn ra vẫn
 * chấm bằng đáp án cũ: "học sinh vào làm sau thì chọn đáp án như tôi đã sửa
 * vẫn bị báo sai".
 *
 * Hàm này vá chỗ đó, và nó đi vào giữa dữ liệu thi thật nên có ba thứ tuyệt
 * đối không được sai:
 *   1. `snapshotId` phải giữ NGUYÊN — điểm từng câu tra theo khoá này, đổi
 *      là cả phòng thi rơi điểm câu đó.
 *   2. Thứ tự phương án đã trộn phải giữ khi tập phương án không đổi — chép
 *      đè thứ tự của ngân hàng là gỡ trộn, hai mã đề thành giống hệt nhau.
 *   3. Đáp án phải thực sự đổi — không thì cả bản vá này vô nghĩa.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-refresh-")), "r.mjs");
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

let pass = 0,
  fail = 0;
const stableDump = (v) => JSON.stringify(v);
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/** Bản chụp trong đề: thứ tự phương án đã trộn (C, A, D, B). */
const frozen = () => ({
  id: "Q-0084",
  snapshotId: "qs_Q-0084_ps8edk2e",
  originalQuestionId: "Q-0084",
  sectionId: "sec-1",
  sectionName: "Phần I",
  snapshottedAt: "2026-08-01T00:00:00.000Z",
  type: "multiple-choice",
  content: "2 + 2 = ?",
  options: [
    { id: "o3", content: "5", isCorrect: true },
    { id: "o1", content: "3", isCorrect: false },
    { id: "o4", content: "6", isCorrect: false },
    { id: "o2", content: "4", isCorrect: false },
  ],
});

/* ── Đúng ca người dùng gặp: sửa đáp án sai thành đúng ─────────────────── */
{
  const live = {
    id: "Q-0084",
    content: "2 + 2 = ?",
    options: [
      { id: "o1", content: "3", isCorrect: false },
      { id: "o2", content: "4", isCorrect: true },
      { id: "o3", content: "5", isCorrect: false },
      { id: "o4", content: "6", isCorrect: false },
    ],
  };
  const { next, changed, structureChanged } = refreshFrozenQuestion(frozen(), live);
  check("có ghi nhận là đã đổi", changed === true);
  check("không coi là đổi cấu trúc", structureChanged === false);
  const dung = next.options.filter((o) => o.isCorrect).map((o) => o.content);
  check("đáp án đúng chuyển sang '4'", dung.join() === "4", JSON.stringify(dung));
  check(
    "'5' không còn là đáp án đúng",
    next.options.find((o) => o.content === "5").isCorrect === false,
  );
  check(
    "THỨ TỰ TRỘN của mã đề được giữ nguyên",
    next.options.map((o) => o.content).join() === "5,3,6,4",
    next.options.map((o) => o.content).join(),
  );
  check("snapshotId KHÔNG đổi", next.snapshotId === "qs_Q-0084_ps8edk2e");
  check("sectionId / sectionName giữ nguyên", next.sectionId === "sec-1" && next.sectionName === "Phần I");
}

/* ── Không đổi gì thì phải báo không đổi ───────────────────────────────── */
{
  const f = frozen();
  const live = { content: "2 + 2 = ?", options: [{ content: "5", isCorrect: true }, { content: "3", isCorrect: false }, { content: "6", isCorrect: false }, { content: "4", isCorrect: false }] };
  check("đáp án y hệt → changed = false", refreshFrozenQuestion(f, live).changed === false);
}

/* ── Sửa ĐỀ BÀI ───────────────────────────────────────────────────────── */
{
  const live = { content: "2 + 3 = ?", options: frozen().options };
  check(
    "mặc định có chép đề bài (ca thi đang diễn ra)",
    refreshFrozenQuestion(frozen(), live).next.content === "2 + 3 = ?",
  );
  check(
    "syncContent:false thì GIỮ đề bài (dùng khi chấm lại bài đã nộp)",
    refreshFrozenQuestion(frozen(), live, { syncContent: false }).next.content ===
      "2 + 2 = ?",
  );
}

/* ── Tập phương án thay đổi → thay nguyên khối, phải báo ra ───────────── */
{
  const live = {
    content: "2 + 2 = ?",
    options: [
      { id: "o1", content: "3", isCorrect: false },
      { id: "o2", content: "bốn", isCorrect: true },
      { id: "o3", content: "5", isCorrect: false },
      { id: "o4", content: "6", isCorrect: false },
    ],
  };
  const r = refreshFrozenQuestion(frozen(), live);
  // Có id ở cả hai bên nên vẫn ghép được — đổi chữ KHÔNG làm mất thứ tự trộn.
  check("đổi chữ nhưng id còn khớp → không mất trộn", r.structureChanged === false);
  check("chữ mới được chép vào", r.next.options.some((o) => o.content === "bốn"));
  check("đáp án đúng đi theo phương án mới", r.next.options.find((o) => o.isCorrect).content === "bốn");
  check("snapshotId vẫn không đổi", r.next.snapshotId === "qs_Q-0084_ps8edk2e");
}
{
  // Bớt phương án
  const live = { options: [{ content: "3", isCorrect: false }, { content: "4", isCorrect: true }] };
  const r = refreshFrozenQuestion(frozen(), live);
  check("bớt phương án → structureChanged", r.structureChanged === true);
  check("số phương án theo ngân hàng", r.next.options.length === 2, String(r.next.options.length));
}

/* ── Câu Đúng/Sai nhiều ý, KHÔNG có id → ghép theo nội dung ───────────── */
//
// Câu soạn trước khi hệ thống gán id cho từng ý. Nội dung là thứ duy nhất
// còn để bám, và nó đủ dùng khi các ý không trùng chữ.
{
  const f = {
    id: "Q-1",
    snapshotId: "qs_1",
    type: "multi-tf",
    subQuestions: [
      { statement: "Ý B", correctAnswer: true },
      { statement: "Ý A", correctAnswer: true },
    ],
  };
  const live = {
    subQuestions: [
      { statement: "Ý A", correctAnswer: false },
      { statement: "Ý B", correctAnswer: true },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  check("không có id → ghép theo NỘI DUNG, không theo thứ tự", r.structureChanged === false);
  check(
    "'Ý A' đổi thành sai",
    r.next.subQuestions.find((s) => s.statement === "Ý A").correctAnswer === false,
  );
  check(
    "'Ý B' vẫn đúng",
    r.next.subQuestions.find((s) => s.statement === "Ý B").correctAnswer === true,
  );
  check(
    "thứ tự ý con trong đề giữ nguyên",
    r.next.subQuestions.map((s) => s.statement).join() === "Ý B,Ý A",
    r.next.subQuestions.map((s) => s.statement).join(),
  );
}

/* ── Có id thì id THẮNG nội dung ──────────────────────────────────────── */
//
// Giáo viên sửa chữ của ý con: id nói a↔a, nội dung nói a↔b. Phải tin id —
// nội dung là thứ vừa bị sửa, lấy nó làm khoá là tự chống lại chính mình.
{
  const f = {
    id: "Q-1b",
    snapshotId: "qs_1b",
    subQuestions: [
      { id: "a", statement: "Ý B", correctAnswer: true },
      { id: "b", statement: "Ý A", correctAnswer: true },
    ],
  };
  const live = {
    subQuestions: [
      { id: "a", statement: "Ý A", correctAnswer: false },
      { id: "b", statement: "Ý B", correctAnswer: true },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  check("id thắng nội dung", r.structureChanged === false);
  check(
    "ý id=a nhận đáp án của id=a bên ngân hàng",
    r.next.subQuestions.find((s) => s.id === "a").correctAnswer === false,
  );
  check(
    "ý id=b giữ đúng",
    r.next.subQuestions.find((s) => s.id === "b").correctAnswer === true,
  );
}

/* ── Trả lời ngắn / điền khuyết ───────────────────────────────────────── */
{
  const f = { id: "Q-2", snapshotId: "qs_2", type: "short-answer", acceptedAnswers: ["4"] };
  const r = refreshFrozenQuestion(f, { acceptedAnswers: ["4", "bốn"] });
  check("acceptedAnswers lấy của ngân hàng", r.next.acceptedAnswers.join() === "4,bốn");
  check("có báo đã đổi", r.changed === true);
}
{
  const f = { id: "Q-3", snapshotId: "qs_3", type: "true-false", correctAnswer: false };
  check(
    "correctAnswer kiểu boolean được cập nhật",
    refreshFrozenQuestion(f, { correctAnswer: true }).next.correctAnswer === true,
  );
  check(
    "ngân hàng không có correctAnswer → giữ nguyên",
    refreshFrozenQuestion(f, {}).next.correctAnswer === false,
  );
}

/* ── Ý con có statement RỖNG: ca Q-0260 trên dữ liệu thật ─────────────── */
//
// 4 ý con, statement đều rỗng. Ghép theo nội dung thì cả 4 cùng khoá "" và
// nhận đáp án của ý CUỐI — viết lại đáp án cả câu, im lặng. Phải ghép theo id.
{
  const f = {
    id: "Q-0260",
    snapshotId: "qs_260",
    type: "multi-tf",
    subQuestions: [
      { id: "sub-30", statement: "", correctAnswer: false },
      { id: "sub-31", statement: "", correctAnswer: true },
      { id: "sub-32", statement: "", correctAnswer: true },
      { id: "sub-33", statement: "", correctAnswer: false },
    ],
  };
  const live = {
    subQuestions: [
      { id: "sub-30", statement: "", correctAnswer: false },
      { id: "sub-31", statement: "", correctAnswer: true },
      { id: "sub-32", statement: "", correctAnswer: false },
      { id: "sub-33", statement: "", correctAnswer: true },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  const got = r.next.subQuestions.map((s) => `${s.id}=${s.correctAnswer}`).join(" ");
  check(
    "statement rỗng → ghép theo id, KHÔNG nhét đáp án của ý cuối cho cả câu",
    got === "sub-30=false sub-31=true sub-32=false sub-33=true",
    got,
  );
  check("không coi là đổi cấu trúc", r.structureChanged === false);
}

/* ── Thứ tự KHOÁ khác nhau không phải là thay đổi ─────────────────────── */
//
// Firestore trả khoá theo thứ tự bất kỳ. So bằng JSON.stringify thô thì
// {"left":..,"id":..} khác {"id":..,"left":..} → báo lệch giả. Bản đầu của
// hàm này báo 423 câu lệch trên dữ liệu thật, hơn 400 câu là lệch giả.
{
  const f = {
    id: "Q-9",
    snapshotId: "qs_9",
    pairs: [
      { left: "Việt Nam", right: "Hà Nội", id: "p-0" },
      { id: "p-1", right: "Paris", left: "Pháp" },
    ],
  };
  const live = {
    pairs: [
      { id: "p-0", left: "Việt Nam", right: "Hà Nội" },
      { id: "p-1", left: "Pháp", right: "Paris" },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  check("chỉ khác thứ tự khoá → KHÔNG coi là đổi", r.changed === false, stableDump(r.next.pairs));
}
// Nhưng đổi thật thì phải bắt được.
{
  const f = { id: "Q-9", snapshotId: "qs_9", pairs: [{ id: "p-0", left: "Việt Nam", right: "Paris" }] };
  const r = refreshFrozenQuestion(f, { pairs: [{ id: "p-0", left: "Việt Nam", right: "Hà Nội" }] });
  check("ghép cặp sai → sửa đúng", r.next.pairs[0].right === "Hà Nội");
  check("và có báo đã đổi", r.changed === true);
}

/* ── Ghép theo id kể cả khi mã đề đã trộn thứ tự ──────────────────────── */
{
  const f = {
    id: "Q-8",
    snapshotId: "qs_8",
    options: [
      { id: "o3", content: "5", isCorrect: true },
      { id: "o2", content: "4", isCorrect: false },
    ],
  };
  const live = {
    options: [
      { id: "o2", content: "4", isCorrect: true },
      { id: "o3", content: "5", isCorrect: false },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  check(
    "ghép theo id, giữ thứ tự trộn",
    r.next.options.map((o) => `${o.content}${o.isCorrect ? "✔" : ""}`).join() === "5,4✔",
    r.next.options.map((o) => `${o.content}${o.isCorrect ? "✔" : ""}`).join(),
  );
}
// Sửa CHỮ của phương án: ghép được theo id nên vẫn giữ thứ tự trộn.
{
  const f = {
    id: "Q-8",
    snapshotId: "qs_8",
    options: [
      { id: "o2", content: "bon", isCorrect: true },
      { id: "o1", content: "3", isCorrect: false },
    ],
  };
  const live = {
    options: [
      { id: "o1", content: "3", isCorrect: false },
      { id: "o2", content: "bốn", isCorrect: true },
    ],
  };
  const r = refreshFrozenQuestion(f, live);
  check("sửa chữ phương án: ghép theo id, không mất trộn", r.structureChanged === false);
  check("chữ mới được chép vào", r.next.options[0].content === "bốn");
  check(
    "syncContent:false thì giữ nguyên chữ cũ",
    refreshFrozenQuestion(f, live, { syncContent: false }).next.options[0].content === "bon",
  );
}

/* ── Id câu gốc: đọc ĐÚNG trường ──────────────────────────────────────── */
//
// Dữ liệu thật dùng `originalQuestionId`. Đọc nhầm sang `id` của bản chụp là
// tra sang câu khác, và bản chụp thì luôn có `id` nên lỗi này im lặng.
check(
  "ưu tiên originalQuestionId",
  bankIdOfSnapshot({ id: "qs_x", originalQuestionId: "Q-0084" }) === "Q-0084",
);
check(
  "sourceQuestionId là phương án dự phòng",
  bankIdOfSnapshot({ id: "qs_x", sourceQuestionId: "Q-9" }) === "Q-9",
);
check("không có gì thì mới dùng id", bankIdOfSnapshot({ id: "Q-7" }) === "Q-7");

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
