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
const { tocInScope, flattenToc, tocSubtreeIds } = await import(out);

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

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
