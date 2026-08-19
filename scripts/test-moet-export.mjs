#!/usr/bin/env node
/**
 * Test hồi quy cho phần TÍNH SỐ LIỆU của bản xuất Word theo mẫu Bộ GD&ĐT
 * (apps/web/src/features/exams/lib/moet-export.ts).
 *
 * Chạy:  node scripts/test-moet-export.mjs
 *
 * Vì sao có file này: phần khó của việc xuất Word không phải API `docx` — mà
 * là gom đúng số liệu. Sai một chỗ thì file Word vẫn mở được, vẫn đẹp, và vẫn
 * SAI. Không ai phát hiện cho tới lúc đối chiếu với Sở.
 *
 * Chỗ dễ sai nhất: Đúng–Sai nhiều ý đếm theo Ý chứ không theo câu. Một câu 4
 * ý là 4 đơn vị trong ma trận và trong cách cộng điểm.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-moet-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/exams/lib/moet-export.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  splitIntoParts,
  unitsOf,
  buildMatrixTable,
  buildSpecTable,
  groupOfPart,
  refOfQuestion,
  subLetter,
  roman,
  optionLabel,
  round2,
  stripAnswerArtifacts,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const PARTS = [
  { id: "mcq", label: "Trắc nghiệm nhiều lựa chọn", questionTypes: ["mcq-single"], pointsPerQuestion: 0.25 },
  { id: "ds", label: "Trắc nghiệm Đúng – Sai", questionTypes: ["multi-tf"], pointsPerQuestion: 0.25 },
  { id: "tl", label: "Tự luận", questionTypes: ["essay"], pointsPerQuestion: 1 },
];
const q = (id, type, over = {}) => ({ id, type, content: `Nội dung ${id}`, ...over });

/* ── 1. Đơn vị tính: Đúng–Sai đếm theo Ý ───────────────────────────────── */
{
  check("trắc nghiệm = 1 đơn vị", unitsOf(q("A", "mcq-single")) === 1);
  check("tự luận = 1 đơn vị", unitsOf(q("B", "essay")) === 1);
  check(
    "Đúng–Sai 4 ý = 4 đơn vị (KHÔNG phải 1)",
    unitsOf(q("C", "multi-tf", { subQuestions: [1, 2, 3, 4].map((i) => ({ statement: `ý ${i}` })) })) === 4,
  );
  check(
    "Đúng–Sai không có ý nào = 0 đơn vị",
    unitsOf(q("D", "multi-tf", { subQuestions: [] })) === 0,
  );
  check("thiếu hẳn subQuestions → 0, không nổ", unitsOf(q("E", "multi-tf")) === 0);
}

/* ── 2. Chia câu về đúng phần ──────────────────────────────────────────── */
{
  const byId = new Map([
    ["q1", q("q1", "mcq-single")],
    ["q2", q("q2", "multi-tf", { subQuestions: [{}, {}, {}, {}] })],
    ["q3", q("q3", "essay")],
    ["q4", q("q4", "mcq-single")],
  ]);
  const { blocks, leftover } = splitIntoParts(["q1", "q2", "q3", "q4"], byId, PARTS);
  check("phần I gom đúng 2 câu trắc nghiệm", blocks[0].items.length === 2);
  check("phần II gom đúng 1 câu Đúng–Sai", blocks[1].items.length === 1);
  check("phần III gom đúng 1 câu tự luận", blocks[2].items.length === 1);
  check("không câu nào rơi ra ngoài", leftover.length === 0);
  check(
    "đánh số lại TỪ 1 trong mỗi phần",
    blocks[0].items.map((i) => i.indexInPart).join() === "1,2" &&
      blocks[2].items[0].indexInPart === 1,
  );
  // Điểm phần Đúng–Sai tính theo Ý: 4 ý × 0.25 = 1.0, không phải 1 câu × 0.25.
  check("điểm phần Đúng–Sai tính theo Ý (4×0.25=1)", blocks[1].points === 1, String(blocks[1].points));
  check("điểm phần trắc nghiệm (2×0.25=0.5)", blocks[0].points === 0.5, String(blocks[0].points));

  // Câu không thuộc phần nào phải NÊU RA, không nhét bừa.
  const byId2 = new Map([["x", q("x", "matching")]]);
  const r2 = splitIntoParts(["x"], byId2, PARTS);
  check("dạng câu ngoài cấu hình → vào leftover, KHÔNG nhét vào phần cuối", r2.leftover.length === 1);
  check("và không phần nào nhận nó", r2.blocks.every((b) => b.items.length === 0));

  // Một câu chỉ vào ĐÚNG MỘT phần, kể cả khi hai phần cùng nhận dạng đó.
  const trung = [
    { id: "p1", label: "P1", questionTypes: ["mcq-single"], pointsPerQuestion: 1 },
    { id: "p2", label: "P2", questionTypes: ["mcq-single"], pointsPerQuestion: 1 },
  ];
  const r3 = splitIntoParts(["q1"], byId, trung);
  check(
    "hai phần cùng nhận một dạng → câu chỉ vào phần đầu, không nhân đôi",
    r3.blocks[0].items.length === 1 && r3.blocks[1].items.length === 0,
  );
  check("id không có trong kho → bỏ qua, không nổ", splitIntoParts(["nope"], byId, PARTS).leftover.length === 0);
}

/* ── 3. Bảng ma trận ───────────────────────────────────────────────────── */
{
  const matrix = {
    parts: PARTS,
    rows: [
      { topicId: "t1", chapterId: "ch1" },
      { topicId: "t2", chapterId: "ch1" },
    ],
    cells: [
      { topicId: "t1", partId: "mcq", bloom: 1, count: 3 },
      { topicId: "t1", partId: "ds", bloom: 2, count: 4 },
      { topicId: "t2", partId: "tl", bloom: 3, count: 1 },
    ],
  };
  const name = (id) => ({ ch1: "Chương 1", t1: "Bài 1", t2: "Bài 2" })[id] ?? id;
  const tbl = buildMatrixTable(matrix, name);

  check("mỗi Bài một dòng", tbl.rows.length === 2);
  check("in TÊN chương/bài, không in id", tbl.rows[0].chapterName === "Chương 1" && tbl.rows[0].topicName === "Bài 1");
  check("ô rỗng = 0, không phải undefined", tbl.rows[0].counts.tl[3] === 0);
  check("cộng dòng đúng (3+4)", tbl.rows[0].total === 7, String(tbl.rows[0].total));
  check("cộng cột đúng", tbl.columnTotals.mcq[1] === 3 && tbl.columnTotals.ds[2] === 4);
  check("tổng toàn bảng = 8", tbl.grandTotal === 8, String(tbl.grandTotal));
  // Cột "Tổng" của mẫu là cộng NGANG theo mức, không phải một ô tổng duy nhất.
  check("cột Tổng theo mức: Biết=3", tbl.bloomTotals[1] === 3, String(tbl.bloomTotals[1]));
  check("cột Tổng theo mức: Hiểu=4", tbl.bloomTotals[2] === 4, String(tbl.bloomTotals[2]));
  check("cột Tổng theo mức: Vận dụng=1", tbl.bloomTotals[3] === 1, String(tbl.bloomTotals[3]));
  // Điểm: mcq 3×0.25=0.75 · ds 4×0.25=1.0 · tl 1×1=1.0 → 2.75
  check("điểm theo phần: mcq=0.75", tbl.pointsByPart.mcq === 0.75, String(tbl.pointsByPart.mcq));
  check("điểm theo phần: ds=1 (4 Ý × 0.25)", tbl.pointsByPart.ds === 1, String(tbl.pointsByPart.ds));
  check("tổng điểm = 2.75", tbl.totalPoints === 2.75, String(tbl.totalPoints));
  check(
    "tỉ lệ % của dòng = điểm dòng / tổng điểm bài",
    tbl.rows[0].percent === 17.5,
    String(tbl.rows[0].percent),
  );
  check(
    "điểm theo mức cộng lại = tổng điểm",
    round2(Object.values(tbl.pointsByBloom).reduce((a, b) => a + b, 0)) === tbl.totalPoints,
  );
  check(
    "tổng cột cộng lại = tổng toàn bảng",
    Object.values(tbl.columnTotals).reduce(
      (s, byB) => s + Object.values(byB).reduce((a, b) => a + b, 0), 0,
    ) === tbl.grandTotal,
  );
  check("chapterId null → không bịa tên chương", buildMatrixTable(
    { ...matrix, rows: [{ topicId: "t1", chapterId: null }] }, name,
  ).rows[0].chapterName === null);
}

/* ── 4. Bản đặc tả theo mẫu thật ───────────────────────────────────────── */
{
  const MATRIX = {
    parts: PARTS,
    rows: [{ topicId: "t1", chapterId: "ch1" }],
    cells: [],
  };
  const byId = new Map([
    ["q1", q("q1", "mcq-single", { competencyIds: ["y-biet"] })],
    ["q2", q("q2", "mcq-single", { competencyIds: ["y-hieu"] })],
    ["q3", q("q3", "multi-tf", {
      competencyIds: ["y-biet"],
      subQuestions: [
        { competencyId: "y-biet" }, { competencyId: "y-biet" },
        { competencyId: "y-hieu" }, { competencyId: "y-vd" },
      ],
    })],
    ["q4", q("q4", "essay", { competencyIds: ["y-vd"] })],
  ]);
  const COMP = {
    "y-biet": { title: "Nêu được khái niệm", bloomLevel: 1, parentId: "t1" },
    "y-hieu": { title: "Giải thích được", bloomLevel: 2, parentId: "t1" },
    "y-vd":   { title: "Vận dụng được", bloomLevel: 3, parentId: "t1" },
  };
  const { blocks } = splitIntoParts(["q1", "q2", "q3", "q4"], byId, PARTS);
  const spec = buildSpecTable(blocks, MATRIX, {
    nameOf: (id) => ({ ch1: "Chủ đề 1", t1: "Bài 1" })[id] ?? id,
    competencyById: (id) => COMP[id],
    topicOf: () => "t1",
  });

  check("mỗi Bài một khối, ba dòng mức độ", spec.length === 1 && spec[0].levels.length === 3);
  check("tên chương/bài đúng", spec[0].chapterName === "Chủ đề 1" && spec[0].topicName === "Bài 1");
  const L = (b) => spec[0].levels.find((l) => l.bloom === b);
  check("YCCĐ xếp đúng mức Biết", L(1).outcomes.join() === "Nêu được khái niệm");
  check("YCCĐ xếp đúng mức Vận dụng", L(3).outcomes.includes("Vận dụng được"));
  check("mã câu trắc nghiệm ở mức Biết = C1", L(1).refs.mcq[1].join() === "C1", L(1).refs.mcq[1].join());
  check("mã câu trắc nghiệm ở mức Hiểu = C2", L(2).refs.mcq[2].join() === "C2", L(2).refs.mcq[2].join());

  // Đây là chỗ mẫu thật đòi hỏi nhất: MỘT câu Đúng–Sai có ý nằm ở BA mức khác
  // nhau, và mã câu phải xuống tới từng ý (C1.a,b / C1.c / C1.d).
  check("Đ/S: hai ý mức Biết gộp thành C1.a,b", L(1).refs.ds[1].join() === "C1.a,b", L(1).refs.ds[1].join());
  check("Đ/S: ý mức Hiểu là C1.c", L(2).refs.ds[2].join() === "C1.c", L(2).refs.ds[2].join());
  check("Đ/S: ý mức Vận dụng là C1.d", L(3).refs.ds[3].join() === "C1.d", L(3).refs.ds[3].join());
  check("tự luận ghi hậu tố .TL", L(3).refs.tl[3].join() === "C1.TL", L(3).refs.tl[3].join());
  check("ô không thuộc mức của dòng thì rỗng", L(1).refs.tl[1].length === 0);
}

/* ── 4b. Nhóm cột TNKQ / Tự luận + mã câu ──────────────────────────────── */
{
  check("phần trắc nghiệm thuộc nhóm TNKQ", groupOfPart(PARTS[0]) === "TNKQ");
  check("phần Đúng–Sai cũng thuộc TNKQ", groupOfPart(PARTS[1]) === "TNKQ");
  check("phần tự luận thuộc nhóm Tự luận", groupOfPart(PARTS[2]) === "Tự luận");
  check("mã câu trắc nghiệm: C3", refOfQuestion(PARTS[0], 3) === "C3");
  check("mã câu Đ/S kèm ý: C2.a,c", refOfQuestion(PARTS[1], 2, ["a", "c"]) === "C2.a,c");
  check("mã câu tự luận: C1.TL", refOfQuestion(PARTS[2], 1) === "C1.TL");
  check("chữ cái ý", [0, 1, 2, 3].map(subLetter).join() === "a,b,c,d");
}

/* ── 5. Nhãn ───────────────────────────────────────────────────────────── */
{
  check("số La Mã", [1, 2, 3, 4, 5, 9].map(roman).join() === "I,II,III,IV,V,IX");
  check("nhãn phương án A/B/C/D", [0, 1, 2, 3].map(optionLabel).join() === "A,B,C,D");
  check("làm tròn 2 chữ số", round2(0.1 + 0.2) === 0.3 && round2(1 / 3) === 0.33);
}

/* ── 6. Cắt đáp án khỏi đề — lấy chuỗi THẬT từ de-mau/SHOC 10 ─────────── */
// Đề mẫu là bản soạn ("đã gắn ID") nên còn dính mã YCCĐ, <KEY=…> và Lời giải.
// Lọt bất kỳ thứ nào ra bản phát cho học sinh là hỏng cả kỳ thi.
{
  const dm = (t) => stripAnswerArtifacts(t);

  check(
    "cắt mã YCCĐ đứng đầu câu",
    dm("[SI10.02.15.D01] Thành tựu nào sau đây là kết quả của công nghệ tế bào động vật?") ===
      "Thành tựu nào sau đây là kết quả của công nghệ tế bào động vật?",
    dm("[SI10.02.15.D01] Thành tựu nào sau đây là kết quả của công nghệ tế bào động vật?"),
  );
  check(
    "cắt mã có chữ F (Đúng–Sai)",
    dm("[SI10.02.9.F02] Khi sinh vật bị kích thích") === "Khi sinh vật bị kích thích",
  );
  check(
    "cắt mã có chữ S (trả lời ngắn)",
    dm("[SI10.02.12.S05] Một nhóm tế bào ban đầu") === "Một nhóm tế bào ban đầu",
  );
  check("cắt <KEY=3>", dm("Hỏi ban đầu có bao nhiêu tế bào? <KEY=3>") === "Hỏi ban đầu có bao nhiêu tế bào?");
  check("cắt KEY dạng đã escape", dm("Câu hỏi &lt;KEY=16&gt;") === "Câu hỏi");
  check(
    "cắt Lời giải và MỌI thứ phía sau",
    dm("Trình bày quá trình. Lời giải: Nguyên nhân gây ung thư: - Sống ô nhiễm.") ===
      "Trình bày quá trình.",
    dm("Trình bày quá trình. Lời giải: Nguyên nhân gây ung thư: - Sống ô nhiễm."),
  );
  check(
    "cắt được cả ba thứ trong một câu",
    dm("[SI10.02.12.E02] Nội dung câu. <KEY=2> Lời giải: đáp án đây") === "Nội dung câu.",
    dm("[SI10.02.12.E02] Nội dung câu. <KEY=2> Lời giải: đáp án đây"),
  );
  // Không được cắt nhầm chữ bình thường có dấu ngoặc vuông.
  check(
    "KHÔNG cắt nhầm ngoặc vuông thường",
    dm("Cho biết [hình 1] mô tả gì?") === "Cho biết [hình 1] mô tả gì?",
    dm("Cho biết [hình 1] mô tả gì?"),
  );
  check("câu sạch thì giữ nguyên", dm("Nguyên phân xảy ra ở đâu?") === "Nguyên phân xảy ra ở đâu?");
  check("chuỗi rỗng / null không nổ", dm("") === "" && dm(null) === "");
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
