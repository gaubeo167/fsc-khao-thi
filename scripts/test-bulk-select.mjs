#!/usr/bin/env node
/**
 * Test hồi quy cho luật tích chọn hàng loạt
 * (apps/web/src/features/question-bank/lib/bulk-select.ts).
 *
 * Chạy:  node scripts/test-bulk-select.mjs
 *
 * Vì sao có file này: tập đã tích sống lâu hơn bộ lọc. Tích 5 câu, đổi bộ
 * lọc, 3 câu biến khỏi màn hình — nhưng id của chúng vẫn nằm trong state.
 * Bấm "Lưu trữ" lúc đó là lưu trữ những câu KHÔNG ai nhìn thấy.
 *
 * Với một nút bấm đơn lẻ thì đó là một dòng sai. Với thao tác hàng loạt thì
 * đó là hỏng dữ liệu ở quy mô lớn, và không màn nào phát hiện hộ vì con số
 * trên nút vẫn khớp với những gì người dùng tích lúc đầu.
 *
 * Mọi ca dưới đây khoá đúng một câu: hành động CHỈ chạm tới dòng đang thấy.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-bulk-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/bulk-select.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  visibleSelection,
  toggleOne,
  toggleAllVisible,
  allVisibleSelected,
  someVisibleSelected,
  selectedRows,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const S = (...ids) => new Set(ids);
const ids = (set) => [...set].sort().join(",");

/* ── 1. Luật lõi: đổi bộ lọc thì tập đã tích CO LẠI ────────────────────── */
{
  const daTich = S("Q1", "Q2", "Q3", "Q4", "Q5");
  // Bộ lọc mới chỉ còn Q1 và Q4 hiển thị.
  const conThay = ["Q1", "Q4"];
  check(
    "đổi bộ lọc: chỉ giữ id còn hiển thị",
    ids(visibleSelection(daTich, conThay)) === "Q1,Q4",
    ids(visibleSelection(daTich, conThay)),
  );
  check(
    "lọc hết sạch → không còn tích gì",
    visibleSelection(daTich, []).size === 0,
  );
  check(
    "không tích gì thì lọc kiểu nào cũng rỗng",
    visibleSelection(S(), ["Q1", "Q2"]).size === 0,
  );
  check(
    "id đã tích nhưng KHÔNG nằm trong danh sách hiển thị thì bị bỏ",
    !visibleSelection(daTich, conThay).has("Q2"),
  );
}

/* ── 2. Hành động chỉ chạm dòng đang thấy ──────────────────────────────── */
{
  const rows = [{ id: "Q1" }, { id: "Q4" }];
  const daTich = S("Q1", "Q2", "Q3", "Q4", "Q5");
  const cham = selectedRows(rows, (r) => r.id, visibleSelection(daTich, ["Q1", "Q4"]));
  check(
    "selectedRows chỉ trả dòng đang hiển thị",
    cham.map((r) => r.id).join(",") === "Q1,Q4",
    cham.map((r) => r.id).join(","),
  );
  check("giữ đúng thứ tự đang hiển thị", cham[0].id === "Q1" && cham[1].id === "Q4");
  check(
    "danh sách rỗng → không chạm gì",
    selectedRows([], (r) => r.id, daTich).length === 0,
  );
}

/* ── 3. Bật/tắt một dòng ───────────────────────────────────────────────── */
{
  check("tích thêm một dòng", ids(toggleOne(S("Q1"), "Q2")) === "Q1,Q2");
  check("bấm lại thì bỏ tích", ids(toggleOne(S("Q1", "Q2"), "Q2")) === "Q1");
  check("không sửa tập gốc (bất biến)", (() => {
    const goc = S("Q1");
    toggleOne(goc, "Q2");
    return goc.size === 1;
  })());
}

/* ── 4. Ô tích đầu bảng ────────────────────────────────────────────────── */
{
  const conThay = ["Q1", "Q2", "Q3"];
  check(
    "chưa tích gì → chọn tất cả",
    ids(toggleAllVisible(S(), conThay)) === "Q1,Q2,Q3",
  );
  check(
    "đã tích đủ → bỏ hết",
    toggleAllVisible(S("Q1", "Q2", "Q3"), conThay).size === 0,
  );
  check(
    "tích một phần → chọn nốt cho đủ",
    ids(toggleAllVisible(S("Q2"), conThay)) === "Q1,Q2,Q3",
  );
  // Đây là chỗ dễ sai nhất: "chọn tất cả" phải là tất cả những gì ĐANG THẤY,
  // không phải gộp thêm những id cũ đang bị bộ lọc ẩn đi.
  check(
    "chọn tất cả KHÔNG kéo theo id đang bị lọc ẩn",
    ids(toggleAllVisible(S("Q9"), conThay)) === "Q1,Q2,Q3",
    ids(toggleAllVisible(S("Q9"), conThay)),
  );
}

/* ── 5. Trạng thái ô tích đầu bảng ─────────────────────────────────────── */
{
  const conThay = ["Q1", "Q2"];
  check("đủ → allSelected", allVisibleSelected(S("Q1", "Q2"), conThay));
  check("thiếu một → chưa đủ", !allVisibleSelected(S("Q1"), conThay));
  check("một phần → someSelected", someVisibleSelected(S("Q1"), conThay));
  check("đủ rồi thì KHÔNG còn là một phần", !someVisibleSelected(S("Q1", "Q2"), conThay));
  check("chưa tích gì → không phải một phần", !someVisibleSelected(S(), conThay));
  // Danh sách rỗng: "mọi phần tử đều đã tích" đúng về mặt logic tập hợp nhưng
  // sai về mặt giao diện — ô tích đầu bảng sẽ hiện dấu ✓ trên một bảng trống.
  check("danh sách rỗng KHÔNG tính là đã chọn hết", !allVisibleSelected(S(), []));
  check("danh sách rỗng không phải một phần", !someVisibleSelected(S("Q1"), []));
  check(
    "danh sách rỗng: có id cũ trong tập cũng vẫn không phải 'đủ'",
    !allVisibleSelected(S("Q1", "Q2"), []),
  );
}

/* ── 6. Đi trọn một vòng như người dùng thật ───────────────────────────── */
{
  // Tích 3 câu ở bộ lọc "tất cả môn"…
  let daTich = S();
  for (const id of ["Q1", "Q2", "Q3"]) daTich = toggleOne(daTich, id);
  check("tích tay 3 câu", daTich.size === 3);

  // …rồi lọc sang môn khác, chỉ còn Q3 và Q7 hiển thị.
  const sauKhiLoc = visibleSelection(daTich, ["Q3", "Q7"]);
  check("sau khi đổi bộ lọc chỉ còn 1 câu được tích", sauKhiLoc.size === 1);
  check("và đó đúng là câu vẫn đang hiển thị", sauKhiLoc.has("Q3"));

  // Bấm hành động: đúng 1 câu bị tác động, không phải 3.
  const rows = [{ id: "Q3" }, { id: "Q7" }];
  const cham = selectedRows(rows, (r) => r.id, sauKhiLoc);
  check("thao tác hàng loạt chỉ chạm 1 câu, không phải 3", cham.length === 1);
  check("không chạm vào câu đã bị lọc ẩn", !cham.some((r) => r.id === "Q1"));
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
