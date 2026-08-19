#!/usr/bin/env node
/**
 * Test hồi quy cho luật "mục lục nào thuộc môn + khối này"
 * (apps/web/src/features/subjects/lib/toc-scope.ts).
 *
 * Chạy:  node scripts/test-toc-scope.mjs
 *
 * Vì sao có file này: luật này từng được viết lại SÁU lần ở sáu file, và năm
 * trong sáu bản có thêm đoạn "khối này chưa có mục lục thì lấy TẤT CẢ mục lục
 * của môn". Nghe hợp lý, sai nghiêm trọng.
 *
 * Đo trên dữ liệu thật: môn Tiếng Anh có 19 node mục lục, TẤT CẢ thuộc khối
 * 10. Nên mọi khối tiếng Anh khác đều mượn mục lục khối 10, và câu hỏi lớp 1
 * được cất vào chương trình lớp 10 mà không có dấu hiệu nào.
 *
 * Ca đầu tiên dưới đây khoá đúng chuyện đó lại. Nếu ai thêm "fallback" cho
 * tiện, test này đỏ.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-toc-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/subjects/lib/toc-scope.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { tocInScope, flattenToc, tocSubtreeIds, keepTocSelection } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const n = (id, over = {}) => ({
  id,
  name: `Mục ${id}`,
  parentId: null,
  subjectId: "anh",
  gradeId: "grade-10",
  order: 0,
  ...over,
});

/* ── Ca người dùng gặp: mục lục CHỈ có ở khối 10 ──────────────────────── */
{
  const nodes = [n("a1"), n("a2"), n("a3")];
  check(
    "khối 10 thấy mục lục của mình",
    tocInScope(nodes, "anh", "grade-10").length === 3,
  );
  check(
    "khối 1 KHÔNG mượn mục lục khối 10",
    tocInScope(nodes, "anh", "grade-1").length === 0,
    JSON.stringify(tocInScope(nodes, "anh", "grade-1").map((x) => x.id)),
  );
  check(
    "khối 6 cũng không mượn",
    tocInScope(nodes, "anh", "grade-6").length === 0,
  );
}

/* ── Node dùng chung mọi khối thì MỌI khối đều thấy ───────────────────── */
{
  const nodes = [n("chung", { gradeId: null }), n("k10")];
  check("khối 10: thấy cả node riêng lẫn node dùng chung", tocInScope(nodes, "anh", "grade-10").length === 2);
  check(
    "khối 1: chỉ thấy node dùng chung",
    tocInScope(nodes, "anh", "grade-1").map((x) => x.id).join() === "chung",
  );
}

/* ── Không lẫn môn ────────────────────────────────────────────────────── */
check(
  "môn khác không lọt vào",
  tocInScope([n("x", { subjectId: "toan" })], "anh", "grade-10").length === 0,
);
check("chưa chọn môn → rỗng", tocInScope([n("x")], null, "grade-10").length === 0);
check("chưa chọn khối → chỉ node dùng chung", (() => {
  const nodes = [n("chung", { gradeId: null }), n("k10")];
  return tocInScope(nodes, "anh", null).map((x) => x.id).join() === "chung";
})());

/* ── Trải cây ─────────────────────────────────────────────────────────── */
{
  const nodes = [
    n("c1", { order: 0 }),
    n("c1.1", { parentId: "c1", order: 0 }),
    n("c1.2", { parentId: "c1", order: 1 }),
    n("c2", { order: 1 }),
  ];
  const flat = flattenToc(nodes);
  check("trải đúng thứ tự cha–con", flat.map((x) => x.id).join() === "c1,c1.1,c1.2,c2", flat.map((x) => x.id).join());
  check("độ sâu đúng", flat.map((x) => x.depth).join() === "0,1,1,0", flat.map((x) => x.depth).join());
}

/* ── Node MỒ CÔI phải được nâng lên gốc, không biến mất ───────────────── */
{
  // Cha nằm ở khối khác nên không lọt vào phạm vi — con thành mồ côi.
  const nodes = [n("con", { parentId: "cha-o-khoi-khac" }), n("goc")];
  const flat = flattenToc(nodes);
  check(
    "node mồ côi vẫn hiện ra",
    flat.some((x) => x.id === "con"),
    JSON.stringify(flat.map((x) => x.id)),
  );
  check("mồ côi được đặt ở độ sâu gốc", flat.find((x) => x.id === "con")?.depth === 0);
}
check("cây rỗng → danh sách rỗng", flattenToc([]).length === 0);
{
  // Dữ liệu vòng: a là cha của b, b là cha của a. Không được treo máy.
  const nodes = [n("a", { parentId: "b" }), n("b", { parentId: "a" })];
  const flat = flattenToc(nodes);
  check("dữ liệu có vòng cha–con: không lặp vô hạn", flat.length <= 2, String(flat.length));
}

/* ── Nhánh con ────────────────────────────────────────────────────────── */
{
  const nodes = [
    n("c1"),
    n("c1.1", { parentId: "c1" }),
    n("c1.1.1", { parentId: "c1.1" }),
    n("c2"),
  ];
  const ids = tocSubtreeIds(nodes, "c1");
  check("lấy cả cháu chắt", [...ids].sort().join() === "c1,c1.1,c1.1.1", [...ids].join());
  check("không lấy nhánh khác", !ids.has("c2"));
  check("lá thì chỉ có chính nó", tocSubtreeIds(nodes, "c2").size === 1);
}

/* ── Đổi Môn/Khối thì BỎ chỗ cất của môn cũ ───────────────────────────── */
// Ba ô state rời nhau, nên đổi môn không tự bỏ chỗ cất. Hỏng im lặng: <select>
// không có option nào mang giá trị cũ nên hiện "— Chọn —", người dùng thấy
// "chưa chọn" mà state vẫn giữ node của môn cũ → cả đề bị cất sang môn khác.
{
  const anh10 = [
    n("anh-c1", { subjectId: "anh", gradeId: "grade-10" }),
    n("anh-c2", { subjectId: "anh", gradeId: "grade-10" }),
  ];
  const toan10 = [n("toan-c1", { subjectId: "toan", gradeId: "grade-10" })];

  check(
    "chỗ cất còn trong phạm vi thì GIỮ nguyên",
    keepTocSelection(anh10, "anh-c2") === "anh-c2",
  );
  check(
    "đổi sang môn khác → chỗ cất cũ bị BỎ",
    keepTocSelection(toan10, "anh-c2") === null,
  );
  check(
    "môn mới KHÔNG có mục lục → vẫn bỏ, không giữ lại giá trị cũ",
    keepTocSelection([], "anh-c2") === null,
  );
  check("chưa chọn gì → null", keepTocSelection(anh10, null) === null);
  check("chuỗi rỗng → null", keepTocSelection(anh10, "") === null);
  check(
    "node đã bị xoá khỏi kho → bỏ",
    keepTocSelection(anh10, "node-da-xoa") === null,
  );

  // Đi qua đúng đường của màn nhập đề: lọc theo môn/khối rồi mới soát lựa chọn.
  const all = [...anh10, ...toan10];
  check(
    "đổi khối trong cùng môn cũng bỏ chỗ cất",
    keepTocSelection(tocInScope(all, "anh", "grade-11"), "anh-c1") === null,
  );
  check(
    "giữ nguyên môn + khối thì không bỏ oan",
    keepTocSelection(tocInScope(all, "anh", "grade-10"), "anh-c1") === "anh-c1",
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
