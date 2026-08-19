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
  buildSpecRows,
  roman,
  optionLabel,
  round2,
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

/* ── 4. Bản đặc tả: YCCĐ ra câu nào ────────────────────────────────────── */
{
  const byId = new Map([
    ["q1", q("q1", "mcq-single", { competencyIds: ["c1"] })],
    ["q2", q("q2", "mcq-single", { competencyIds: ["c1"] })],
    ["q3", q("q3", "essay", { competencyIds: ["c2"] })],
    ["q4", q("q4", "mcq-single")], // chưa gắn YCCĐ
  ]);
  const { blocks } = splitIntoParts(["q1", "q2", "q3", "q4"], byId, PARTS);
  const comp = (id) =>
    ({
      c1: { code: "SI10.02.15.D01", title: "Nêu được…", bloomLevel: 1 },
      c2: { code: "SI10.02.15.E01", title: "Vận dụng…", bloomLevel: 3 },
    })[id];
  const rows = buildSpecRows(blocks, comp);

  check("gom theo YCCĐ, không lặp dòng", rows.filter((r) => r.code === "SI10.02.15.D01").length === 1);
  check(
    "một YCCĐ ra 2 câu thì liệt kê cả 2",
    rows.find((r) => r.code === "SI10.02.15.D01").questionRefs.length === 2,
  );
  check(
    "mã câu ghi theo PHẦN (I.1, I.2)",
    rows.find((r) => r.code === "SI10.02.15.D01").questionRefs.join() === "I.1,I.2",
    rows.find((r) => r.code === "SI10.02.15.D01").questionRefs.join(),
  );
  check(
    "câu tự luận ở phần III → nhãn III.1",
    rows.find((r) => r.code === "SI10.02.15.E01").questionRefs.join() === "III.1",
    rows.find((r) => r.code === "SI10.02.15.E01").questionRefs.join(),
  );
  // Câu chưa gắn chuẩn đầu ra là thứ người duyệt CẦN thấy, không được bỏ đi.
  const chuaGan = rows.find((r) => r.title === "(chưa gắn YCCĐ)");
  check("câu chưa gắn YCCĐ vẫn được liệt kê", !!chuaGan);
  check("và đúng câu đó (I.3)", chuaGan.questionRefs.join() === "I.3", chuaGan?.questionRefs.join());
  check("sắp theo mã YCCĐ", rows[0].code === "SI10.02.15.D01");
}

/* ── 5. Nhãn ───────────────────────────────────────────────────────────── */
{
  check("số La Mã", [1, 2, 3, 4, 5, 9].map(roman).join() === "I,II,III,IV,V,IX");
  check("nhãn phương án A/B/C/D", [0, 1, 2, 3].map(optionLabel).join() === "A,B,C,D");
  check("làm tròn 2 chữ số", round2(0.1 + 0.2) === 0.3 && round2(1 / 3) === 0.33);
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
