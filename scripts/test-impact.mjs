#!/usr/bin/env node
/**
 * Test hồi quy cho bộ đếm "xoá cái này thì mất gì"
 * (apps/web/src/features/question-bank/lib/impact.ts).
 *
 * Chạy:  node scripts/test-impact.mjs
 *
 * Vì sao có file này: ba lệnh xoá trong phần quản trị đều dọn gọn trong phạm
 * vi của mình rồi dừng, KHÔNG lệnh nào ngó sang kho câu hỏi. Xoá môn thì câu
 * hỏi ở lại trong kho nhưng trỏ vào một môn không còn tồn tại; xoá node mục
 * lục / YCCĐ thì câu hỏi giữ nguyên id đã chết. Cả hai đều im lặng — không
 * có màn nào báo, và không có cách nào lần ra sau đó.
 *
 * Những ca dưới khoá lại đúng hai việc: ĐẾM đủ trước khi xoá (kể cả gắn ở
 * cấp ý và cấp phương án), và GỠ sạch tham chiếu sau khi xoá.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-impact-")), "i.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/impact.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  subtreeIds,
  questionsOfSubject,
  questionsOfToc,
  questionsOfCompetency,
  clearCompetencyRefs,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Cây: gốc → con → cháu ────────────────────────────────────────────── */
const TREE = [
  { id: "n1", parentId: null },
  { id: "n2", parentId: "n1" },
  { id: "n3", parentId: "n2" },
  { id: "n9", parentId: null },
];
check("subtreeIds lấy cả cháu chắt", [...subtreeIds(TREE, "n1")].sort().join() === "n1,n2,n3");
check("subtreeIds không lấy nhánh khác", !subtreeIds(TREE, "n1").has("n9"));
check("subtreeIds của lá chỉ có chính nó", subtreeIds(TREE, "n3").size === 1);

/* ── Câu hỏi mẫu ──────────────────────────────────────────────────────── */
const Q = (over) => ({
  id: "q?",
  type: "mcq-single",
  subjectId: "sub-toan",
  gradeId: "g1",
  tocNodeId: null,
  competencyIds: [],
  options: [],
  ...over,
});
const QS = [
  Q({ id: "q1", tocNodeId: "n2" }),
  Q({ id: "q2", tocNodeId: "n3" }),
  Q({ id: "q3", tocNodeId: "n9" }),
  Q({ id: "q4", subjectId: "sub-sinh" }),
  // Câu đã lưu trữ: không còn hiện ở đâu nên không tính vào ảnh hưởng.
  Q({ id: "q5", tocNodeId: "n2", archivedAt: "2026-01-01T00:00:00Z" }),
];

/* ── Theo môn ─────────────────────────────────────────────────────────── */
check(
  "đếm câu theo môn (3 câu sống, câu đã lưu trữ không tính)",
  questionsOfSubject(QS, "sub-toan").length === 3,
  String(questionsOfSubject(QS, "sub-toan").length),
);
check("môn khác không lẫn vào", questionsOfSubject(QS, "sub-sinh").length === 1);
check(
  "câu đã lưu trữ không tính",
  questionsOfSubject(QS, "sub-toan").every((q) => q.id !== "q5"),
);
check("môn không có câu nào → 0", questionsOfSubject(QS, "sub-ly").length === 0);

/* ── Theo mục lục ─────────────────────────────────────────────────────── */
{
  const ids = subtreeIds(TREE, "n2");
  const hit = questionsOfToc(QS, ids);
  check("xoá nhánh mục lục: đếm cả câu ở node CON", hit.length === 2, hit.map((q) => q.id).join());
  check("không tính câu ở nhánh khác", !hit.some((q) => q.id === "q3"));
}

/* ── Theo YCCĐ: cấp câu, cấp ý, cấp phương án ─────────────────────────── */
{
  const COMPS = [
    { id: "c1", parentId: null },
    { id: "c2", parentId: "c1" },
    { id: "c9", parentId: null },
  ];
  const ids = subtreeIds(COMPS, "c1");

  const capCau = Q({ id: "a1", competencyIds: ["c2"] });
  const capY = Q({
    id: "a2",
    type: "multi-tf",
    subQuestions: [
      { id: "s1", statement: "ý 1", correctAnswer: true, competencyId: "c2", bloomLevel: 2 },
      { id: "s2", statement: "ý 2", correctAnswer: false, competencyId: "c9" },
    ],
  });
  const capPhuongAn = Q({
    id: "a3",
    type: "mcq-multi",
    options: [
      { id: "o1", content: "A", isCorrect: true, competencyId: "c1" },
      { id: "o2", content: "B", isCorrect: false },
    ],
  });
  const khongDinh = Q({ id: "a4", competencyIds: ["c9"] });
  const all = [capCau, capY, capPhuongAn, khongDinh];

  const hit = questionsOfCompetency(all, ids);
  check(
    "đếm đủ cả gắn cấp câu, cấp ý, cấp phương án",
    hit.map((q) => q.id).sort().join() === "a1,a2,a3",
    hit.map((q) => q.id).join(),
  );
  check("câu gắn YCCĐ nhánh khác không bị tính", !hit.some((q) => q.id === "a4"));

  /* ── Gỡ tham chiếu ───────────────────────────────────────────────── */
  const p1 = clearCompetencyRefs(capCau, ids);
  check("gỡ cấp câu: competencyIds rỗng", p1?.competencyIds.length === 0, JSON.stringify(p1));
  check("gỡ hết YCCĐ thì bỏ luôn Bloom của câu", "bloomLevel" in (p1 ?? {}) && p1.bloomLevel === undefined);

  const p2 = clearCompetencyRefs(capY, ids);
  check("gỡ cấp ý: ý dính thì null", p2?.subQuestions[0].competencyId === null, JSON.stringify(p2));
  check("gỡ cấp ý: bỏ luôn Bloom của ý đó", p2?.subQuestions[0].bloomLevel === undefined);
  check("gỡ cấp ý: ý thuộc nhánh KHÁC giữ nguyên", p2?.subQuestions[1].competencyId === "c9");
  check("gỡ cấp ý: giữ nguyên nội dung và đáp án của ý", p2?.subQuestions[0].statement === "ý 1" && p2?.subQuestions[0].correctAnswer === true);

  const p3 = clearCompetencyRefs(capPhuongAn, ids);
  check("gỡ cấp phương án", p3?.options[0].competencyId === null, JSON.stringify(p3));
  check("gỡ cấp phương án: giữ nguyên nội dung + đúng/sai", p3?.options[0].content === "A" && p3?.options[0].isCorrect === true);

  check("câu không dính → không sinh bản vá thừa", clearCompetencyRefs(khongDinh, ids) === null);
}

/* ── Câu hỏi cũ thiếu hẳn trường YCCĐ ─────────────────────────────────── */
{
  const cu = { id: "old", subjectId: "s", gradeId: "g", tocNodeId: null };
  check("dữ liệu cũ không có competencyIds → không nổ", questionsOfCompetency([cu], new Set(["c1"])).length === 0);
  check("dữ liệu cũ → không sinh bản vá", clearCompetencyRefs(cu, new Set(["c1"])) === null);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
