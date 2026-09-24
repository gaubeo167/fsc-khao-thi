#!/usr/bin/env node
/**
 * Test hồi quy: CÂU NHÓM — một đề bài chung, nhiều câu hỏi phụ khác dạng nhau
 * (apps/web/src/lib/exam/group-score.ts).
 *
 * Chạy:  node scripts/test-group-question.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Dạng này là bài đọc hiểu tiếng Anh: một đoạn văn, bên dưới 5–8 câu hỏi có
 * thể là trắc nghiệm một đáp án, nhiều đáp án, hoặc trả lời ngắn. Ba chỗ dễ
 * gãy và đều gãy trong im lặng:
 *
 *   1. ĐIỂM CỦA CẢ CỤM. Cụm phải nặng bằng SỐ Ý của nó. Nếu tính như một câu
 *      lẻ thì bài đọc 8 câu ăn điểm bằng đúng một câu trắc nghiệm — học sinh
 *      làm 8 câu mà được 1 phần điểm.
 *
 *   2. BÓC ĐÁP ÁN trước khi gửi đề cho học sinh. Đáp án nằm LỒNG trong từng
 *      ý, nên hàm bóc đáp án cũ không chạm tới — gửi thẳng đáp án xuống
 *      trình duyệt mà không ai thấy.
 *
 *   3. HAI BỘ CHẤM. Ca thi thật và thi thử chấm bằng hai file khác nhau; dạng
 *      multi-tf đã từng lệch nhau vì chuyện đó. Ca này bắt hai bên khớp.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-group-"));
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

const { groupRatio, groupSubRatio, groupAllCorrect } = await import(
  bundle("src/lib/exam/group-score.ts", "g.mjs")
);
const { gradeQuestion, stripAnswers, computeWeightedAttemptScore } = await import(
  bundle("src/lib/exam/grade.ts", "gr.mjs")
);
const { gradeQuestion: gradeTrial } = await import(
  bundle("src/features/exams/lib/grade.ts", "t.mjs")
);
const { computePerQuestionScores, questionSlots } = await import(
  bundle("src/features/exam-shifts/lib/scoring.ts", "s.mjs")
);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** Cụm 3 ý: 1 đáp án · nhiều đáp án · trả lời ngắn. */
const SUBS = [
  {
    id: "s1",
    type: "mcq-single",
    content: "Where does she play?",
    options: [
      { id: "s1a", content: "Hanoi", isCorrect: true },
      { id: "s1b", content: "Hue", isCorrect: false },
    ],
  },
  {
    id: "s2",
    type: "mcq-multi",
    content: "Which are true?",
    options: [
      { id: "s2a", content: "A", isCorrect: true },
      { id: "s2b", content: "B", isCorrect: true },
      { id: "s2c", content: "C", isCorrect: false },
    ],
  },
  {
    id: "s3",
    type: "short-answer",
    content: "Write the verb.",
    acceptedAnswers: ["plays"],
  },
];

const group = {
  id: "G1",
  type: "group",
  content: "Đọc đoạn văn sau…",
  subQuestions: SUBS,
  difficulty: "medium",
  subjectId: "sub",
  gradeId: "k6",
  campusId: "cs",
  status: "approved",
  tags: [],
  kho: "personal",
  ownerId: "gv",
  ownerName: "GV",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ans = (over = {}) => ({
  kind: "group",
  answers: {
    s1: { kind: "mcq-single", optionId: "s1a" },
    s2: { kind: "mcq-multi", optionIds: ["s2a", "s2b"] },
    s3: { kind: "short-answer", text: "plays" },
    ...over,
  },
});

/* ── 1. Tỉ lệ điểm từng ý ────────────────────────────────────────────── */
console.log("── Chấm từng ý phụ theo ĐÚNG dạng của nó ──");
check("ý 1 đáp án · chọn đúng → 1", near(groupSubRatio(SUBS[0], { kind: "mcq-single", optionId: "s1a" }), 1));
check("ý 1 đáp án · chọn sai → 0", near(groupSubRatio(SUBS[0], { kind: "mcq-single", optionId: "s1b" }), 0));
check("ý nhiều đáp án · đúng đủ → 1", near(groupSubRatio(SUBS[1], { kind: "mcq-multi", optionIds: ["s2a", "s2b"] }), 1));
check("ý nhiều đáp án · thiếu 1 → 0 (toàn phần)", near(groupSubRatio(SUBS[1], { kind: "mcq-multi", optionIds: ["s2a"] }), 0));
check(
  "ý nhiều đáp án · chấm từng phần → 0,5",
  near(groupSubRatio(SUBS[1], { kind: "mcq-multi", optionIds: ["s2a"] }, { mcqMulti: "partial" }), 0.5),
);
check(
  "chọn thừa đáp án sai bị trừ (từng phần)",
  near(
    groupSubRatio(SUBS[1], { kind: "mcq-multi", optionIds: ["s2a", "s2b", "s2c"] }, { mcqMulti: "partial" }),
    0.5,
  ),
);
check("ý trả lời ngắn · đúng → 1", near(groupSubRatio(SUBS[2], { kind: "short-answer", text: "plays" }), 1));
check(
  "ý trả lời ngắn · dấu nháy cong vẫn khớp",
  near(groupSubRatio({ ...SUBS[2], acceptedAnswers: ["doesn’t"] }, { kind: "short-answer", text: "doesn't" }), 1),
);
check("ý chưa trả lời → 0, không nổ", near(groupSubRatio(SUBS[0], undefined), 0));

/* ── 2. Điểm cả cụm ──────────────────────────────────────────────────── */
console.log("\n── Điểm cả cụm = trung bình các ý ──");
check("đúng hết 3 ý → 1", near(groupRatio(SUBS, ans().answers), 1));
check("sai 1 ý → 2/3", near(groupRatio(SUBS, ans({ s1: { kind: "mcq-single", optionId: "s1b" } }).answers), 2 / 3));
check("không làm ý nào → 0", near(groupRatio(SUBS, {}), 0));
check("đúng hết mới tính là câu đúng", groupAllCorrect(SUBS, ans().answers));
check(
  "sai một ý thì KHÔNG phải câu đúng",
  !groupAllCorrect(SUBS, ans({ s3: { kind: "short-answer", text: "play" } }).answers),
);
// Đơn điệu: làm đúng thêm ý thì điểm không được giảm.
{
  let truoc = groupRatio(SUBS, {});
  let donDieu = true;
  const dung = ans().answers;
  const acc = {};
  for (const sub of SUBS) {
    acc[sub.id] = dung[sub.id];
    const sau = groupRatio(SUBS, { ...acc });
    if (sau < truoc - 1e-9) donDieu = false;
    truoc = sau;
  }
  check("làm đúng thêm ý thì điểm KHÔNG giảm", donDieu);
}

/* ── 3. Bóc đáp án trước khi gửi cho học sinh ────────────────────────── */
console.log("\n── Bóc đáp án: đề gửi xuống trình duyệt KHÔNG được mang đáp án ──");
{
  const sach = stripAnswers(group);
  const json = JSON.stringify(sach);
  check(
    "không còn phương án nào đánh dấu đúng",
    sach.subQuestions.every((s) => (s.options ?? []).every((o) => !o.isCorrect)),
  );
  check(
    "không còn đáp án trả lời ngắn",
    sach.subQuestions.every((s) => (s.acceptedAnswers ?? []).length === 0),
  );
  check('chuỗi đáp án "plays" không lọt xuống', !json.includes('"plays"'), json.slice(0, 200));
  check("nội dung câu hỏi vẫn còn", sach.subQuestions[0].content === SUBS[0].content);
}

/* ── 4. Hai bộ chấm phải khớp nhau ───────────────────────────────────── */
console.log("\n── Ca thi thật và thi thử ra cùng con số ──");
for (const [ten, a] of [
  ["đúng hết", ans()],
  ["sai ý 1", ans({ s1: { kind: "mcq-single", optionId: "s1b" } })],
  ["sai ý 3", ans({ s3: { kind: "short-answer", text: "play" } })],
  ["bỏ trống hết", { kind: "group", answers: {} }],
]) {
  const that = gradeQuestion(group, a)?.points ?? 0;
  const thu = gradeTrial(group, a).score;
  check(`${ten}: bộ chấm thật = bộ chấm thi thử`, near(that, thu), `${that} ≠ ${thu}`);
}

/* ── 5. Cụm nặng bằng SỐ Ý khi chia điểm ─────────────────────────────── */
console.log("\n── Cụm 3 ý ăn 3 phần điểm, không phải 1 ──");
const le = (id) => ({
  ...group,
  id,
  type: "mcq-single",
  subQuestions: undefined,
  options: [
    { id: `${id}a`, content: "A", isCorrect: true },
    { id: `${id}b`, content: "B", isCorrect: false },
  ],
});
check("câu thường nặng 1 suất", questionSlots(le("Q1")) === 1);
check("cụm 3 ý nặng 3 suất", questionSlots(group) === 3);
{
  // Đề: 1 cụm 3 ý + 2 câu lẻ = 5 suất. Thang 10 → cụm 6đ, mỗi câu lẻ 2đ.
  const de = [group, le("Q1"), le("Q2")];
  const diem = computePerQuestionScores({ maxScore: 10, mode: "even" }, de);
  check("cụm 3 ý ăn 6,0đ", near(diem.G1, 6), String(diem.G1));
  check("câu lẻ ăn 2,0đ", near(diem.Q1, 2), String(diem.Q1));
  const tong = Object.values(diem).reduce((a, b) => a + b, 0);
  check("Σ vẫn đúng thang điểm", near(tong, 10), String(tong));
}

/* ── 6. Cộng lên điểm cả bài ─────────────────────────────────────────── */
console.log("\n── Cộng vào điểm toàn bài ──");
{
  const de = [group, le("Q1"), le("Q2")];
  const baiLam = {
    G1: ans({ s1: { kind: "mcq-single", optionId: "s1b" } }), // đúng 2/3 ý
    Q1: { kind: "mcq-single", optionId: "Q1a" },
    Q2: { kind: "mcq-single", optionId: "Q2b" },
  };
  const w = computeWeightedAttemptScore(de, baiLam, (q) =>
    computePerQuestionScores({ maxScore: 10, mode: "even" }, de)[q.id],
  );
  // cụm 6đ × 2/3 = 4 · Q1 đúng 2đ · Q2 sai 0 → 6,0
  check("đúng 2/3 ý cụm + 1 câu lẻ → 6,0đ", near(w.points, 6), String(w.points));
}

/* ── 7. Đọc CÂU NHÓM từ file Word (mã G) ─────────────────────────────── */
//
// Khuôn mã đang dùng: [CHUYÊNĐỀ.LOẠI##.ĐỘKHÓ] với LOẠI = D/F/S/E. Câu nhóm
// thêm chữ G. Trong cụm, mỗi ý mở bằng `<1>`, `<2>`… và dạng của ý SUY RA từ
// chính nội dung: có <Key=…> là trả lời ngắn, còn lại đếm số phương án gạch
// chân (1 → một đáp án, ≥2 → nhiều đáp án) — đúng luật của mã D.
console.log("\n── Đọc câu nhóm từ file Word (mã G) ──");
{
  const { parseExamBank } = await import(
    bundle("src/features/question-bank/lib/parse-exam-bank.ts", "p.mjs")
  );
  const U = (t) => `\u27E6U\u27E7${t}\u27E6/U\u27E7`;
  const doc = [
    "[EN6.01.1.G01.b] Read the passage and answer the questions.",
    "Lan is a student. She plays badminton every afternoon.",
    "<1> What does Lan play?",
    `A. ${U("Badminton")}`,
    "B. Football",
    "C. Tennis",
    "<2> Which sentences are true?",
    `A. ${U("Lan is a student.")}`,
    `B. ${U("Lan plays in the afternoon.")}`,
    "C. Lan plays football.",
    "<3> Write the verb in the passage.",
    "<Key=plays>",
  ].join("\n");
  const { questions, warnings } = parseExamBank(doc);
  check("đọc ra đúng 1 câu nhóm", questions.length === 1, `được ${questions.length}`);
  const q = questions[0];
  check("nhận đúng dạng câu nhóm", q?.qType === "group", q?.qType);
  check("ngữ liệu chung giữ lại", /Lan is a student/.test(q?.content ?? ""), q?.content);
  check("ngữ liệu KHÔNG nuốt câu hỏi phụ", !/What does Lan play/.test(q?.content ?? ""));
  check("tách đúng 3 ý phụ", q?.groupSubs.length === 3, String(q?.groupSubs.length));
  check("ý 1 = trắc nghiệm 1 đáp án", q?.groupSubs[0]?.type === "mcq-single", q?.groupSubs[0]?.type);
  check("ý 1 lấy đúng đáp án gạch chân", q?.groupSubs[0]?.options.find((o) => o.isCorrect)?.content === "Badminton");
  check("ý 2 = trắc nghiệm nhiều đáp án", q?.groupSubs[1]?.type === "mcq-multi", q?.groupSubs[1]?.type);
  check("ý 2 có đúng 2 đáp án đúng", q?.groupSubs[1]?.options.filter((o) => o.isCorrect).length === 2);
  check("ý 3 = trả lời ngắn", q?.groupSubs[2]?.type === "short-answer", q?.groupSubs[2]?.type);
  check("ý 3 lấy được <Key=plays>", JSON.stringify(q?.groupSubs[2]?.acceptedAnswers ?? []).includes("plays"));
  check("không có cảnh báo nào", (q?.warnings.length ?? 1) === 0, JSON.stringify(q?.warnings));
  check("không có cảnh báo mức file", warnings.length === 0, JSON.stringify(warnings));

  // Thiếu gạch chân thì phải KÊU, đừng lặng lẽ tạo câu không có đáp án.
  const thieu = parseExamBank(
    ["[EN6.01.1.G02] Passage.", "<1> Question?", "A. One", "B. Two"].join("\n"),
  ).questions[0];
  check(
    "ý chưa gạch chân đáp án → có cảnh báo",
    (thieu?.warnings ?? []).some((w) => /chưa gạch chân/i.test(w)),
    JSON.stringify(thieu?.warnings),
  );
  const rong = parseExamBank(["[EN6.01.1.G03] Chỉ có ngữ liệu."].join("\n")).questions[0];
  check(
    "cụm không có ý phụ nào → có cảnh báo",
    (rong?.warnings ?? []).some((w) => /không có ý phụ/i.test(w)),
    JSON.stringify(rong?.warnings),
  );
}

/* ── 8. Báo cáo của GV phải cộng ĐIỂM TỪNG PHẦN ──────────────────────── */
//
// Lỗi /qa bắt được: học sinh làm đúng 2/3 ý của câu nhóm, màn kết quả của em
// hiện 6,67/10, nhưng màn Báo cáo của giáo viên hiện 0/10. Báo cáo cộng điểm
// theo kiểu ĐÚNG HẾT MỚI TÍNH, nên mọi dạng chấm từng phần (câu nhóm, Đúng–Sai
// lũy tiến, trắc nghiệm nhiều đáp án chấm từng phần, trả lời ngắn ăn % đáp án)
// đều rơi về 0 ở bảng của giáo viên. Hai con số nói hai chuyện khác nhau về
// cùng một bài làm.
console.log("\n── Báo cáo của GV cộng đúng điểm từng phần ──");
{
  const { buildShiftReport } = await import(
    bundle("src/features/reports/lib/compute-stats.ts", "r.mjs")
  );
  const shift = {
    id: "S1",
    name: "Ca",
    subjectId: "sub",
    gradeId: "k6",
    classIds: [],
    campusId: "cs",
    rooms: [{ id: "r", name: "P", studentIds: ["hs1"], proctorIds: [] }],
    scoring: { maxScore: 10, mode: "even" },
    startAt: "2026-02-01T01:00:00.000Z",
    endAt: "2026-02-01T02:00:00.000Z",
    status: "completed",
  };
  const attempt = {
    id: "a1",
    shiftId: "S1",
    studentId: "hs1",
    questionIds: ["G1"],
    answers: { G1: ans({ s1: { kind: "mcq-single", optionId: "s1b" } }) },
    startedAt: "2026-02-01T01:00:00.000Z",
    submittedAt: "2026-02-01T01:10:00.000Z",
    violations: { tabSwitches: 0, fullscreenExits: 0, pasteAttempts: 0 },
  };
  const rep = buildShiftReport({
    shift,
    attempts: [attempt],
    questions: [group],
    essayGrades: [],
    eligible: 1,
  });
  check(
    "đúng 2/3 ý câu nhóm → báo cáo ra 6,67đ (không phải 0)",
    Math.abs(rep.totals.avgRaw - 6.67) < 0.02,
    `đang là ${rep.totals.avgRaw}`,
  );
  check(
    "cột 'câu đúng' vẫn chỉ đếm câu ĐÚNG HẾT",
    rep.perStudent[0].correctCount === 0,
    String(rep.perStudent[0].correctCount),
  );

  // Đúng–Sai lũy tiến cũng phải cộng từng phần — cùng một lỗi.
  const mtf = {
    ...group,
    id: "T1",
    type: "multi-tf",
    subQuestions: [
      { id: "t1", statement: "Ý 1", correctAnswer: true },
      { id: "t2", statement: "Ý 2", correctAnswer: true },
      { id: "t3", statement: "Ý 3", correctAnswer: true },
      { id: "t4", statement: "Ý 4", correctAnswer: true },
    ],
  };
  const repTf = buildShiftReport({
    shift,
    attempts: [
      {
        ...attempt,
        questionIds: ["T1"],
        answers: {
          T1: { kind: "multi-tf", values: { t1: true, t2: true, t3: true, t4: false } },
        },
      },
    ],
    questions: [mtf],
    essayGrades: [],
    eligible: 1,
  });
  check(
    "Đúng–Sai đúng 3/4 ý → báo cáo KHÔNG ra 0",
    repTf.totals.avgRaw > 0,
    `đang là ${repTf.totals.avgRaw}`,
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
