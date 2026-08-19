#!/usr/bin/env node
/**
 * Test hồi quy cho BẢNG trong nội dung câu hỏi
 * (apps/web/src/features/question-bank/lib/table-block.ts).
 *
 * Chạy:  node scripts/test-table-block.mjs
 *
 * Vì sao có file này: đề Word dùng bảng cho hai việc khác hẳn nhau. Bảng 1
 * hàng là cách XẾP CHỖ (khối tiêu đề đầu đề; bốn phương án nằm ngang — file
 * AIMO có 16 bảng như vậy) và phải giữ nguyên lối bẻ phẳng cũ, vì bộ đọc
 * phương án đang dựa vào đó. Bảng nhiều hàng là DỮ LIỆU THẬT (bảng lời giải
 * 5×4 của đề SHOC 10, bảng Speed/Time/Distance 3×4 của đề AIMO) và bẻ phẳng
 * là mất nghĩa.
 *
 * Nới ranh giới ra một chút là hỏng 16 câu AIMO; siết vào là mất bảng lời
 * giải. Nên khoá cả hai phía.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-table-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/table-block.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  isDataTable,
  toPipeTable,
  splitTableBlocks,
  isTableRowLine,
  hasDataTable,
  tableToPlainLines,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── 1. Ranh giới bảng dữ liệu vs bảng xếp chỗ ─────────────────────────── */
check("1 hàng × 2 cột (khối tiêu đề đầu đề) KHÔNG phải bảng", isDataTable([["SỞ GD", "KIỂM TRA"]]) === false);
check(
  "1 hàng × 4 cột (bốn phương án nằm ngang) KHÔNG phải bảng",
  isDataTable([["A: $466", "B: $200", "C: $400", "D: $240"]]) === false,
);
check("2 hàng × 1 cột KHÔNG phải bảng", isDataTable([["a"], ["b"]]) === false);
check("2 hàng × 2 cột LÀ bảng", isDataTable([["a", "b"], ["c", "d"]]) === true);
check("5 hàng × 4 cột (bảng lời giải SHOC 10) LÀ bảng", isDataTable([
  ["Các giai đoạn", "Sự phát sinh giao tử đực", "Sự phát sinh giao tử cái", "Điểm"],
  ["Phát triển", "…", "…", "0,25"],
  ["Giảm phân I", "…", "…", "0,25"],
  ["Giảm phân II", "…", "…", "0,25"],
  ["Kết quả", "…", "…", "0,25"],
]) === true);
check("3 hàng × 4 cột (bảng Speed/Time/Distance của AIMO) LÀ bảng", isDataTable([
  ["", "Speed", "Time", "Distance"],
  ["Minute hand", "12 cm/h", "t", ""],
  ["Hour hand", "1 cm/h", "t", ""],
]) === true);
check("bảng rỗng KHÔNG phải bảng", isDataTable([]) === false);
check(
  "đếm cột theo hàng RỘNG NHẤT, không theo hàng đầu",
  isDataTable([["gộp"], ["a", "b"]]) === true,
);

/* ── 2. Dựng cú pháp gạch đứng ─────────────────────────────────────────── */
{
  const t = toPipeTable([["Giai đoạn", "Điểm"], ["Phát triển", "0,25"]]);
  check("có hàng ngăn cách", t.split("\n")[1] === "| --- | --- |", JSON.stringify(t.split("\n")[1]));
  check("hàng đầu đúng", t.split("\n")[0] === "| Giai đoạn | Điểm |", t.split("\n")[0]);
  check("đủ 3 dòng", t.split("\n").length === 3);
}
{
  // Hàng thiếu ô phải được đệm cho đủ cột, không thì hàng sau lệch cột.
  const t = toPipeTable([["a", "b", "c"], ["x"]]);
  check("hàng thiếu ô được đệm đủ cột", t.split("\n")[2] === "| x |  |  |", t.split("\n")[2]);
}
{
  // Ô có gạch đứng: che lại, không thì một ô thành hai.
  const t = toPipeTable([["P(A|B)", "0,5"], ["x", "y"]]);
  const back = splitTableBlocks(t)[0];
  check("ô chứa '|' được che khi ghi", /P\(A\\\|B\)/.test(t), t.split("\n")[0]);
  check("…và đọc lại ra đúng ô cũ", back.rows[0][0] === "P(A|B)", JSON.stringify(back.rows[0]));
  check("…không bị tách thành 3 ô", back.rows[0].length === 2, String(back.rows[0].length));
}

/* ── 3. Nhận dòng bảng ─────────────────────────────────────────────────── */
check("dòng bảng thật", isTableRowLine("| a | b |") === true);
check("thiếu gạch đứng cuối → KHÔNG phải dòng bảng", isTableRowLine("| a | b") === false);
check("chỉ một cột → KHÔNG phải dòng bảng", isTableRowLine("| a |") === false);
// Câu hỏi xác suất có điều kiện viết P(A|B) — nới luật là nuốt mất câu hỏi.
check(
  "câu hỏi chứa P(A|B) KHÔNG bị nhận nhầm là bảng",
  isTableRowLine("Tính xác suất P(A|B) khi biết P(B) = 0,4.") === false,
);
check("dòng rỗng KHÔNG phải dòng bảng", isTableRowLine("") === false);

/* ── 4. Cắt nội dung thành mảng ────────────────────────────────────────── */
{
  const src = [
    "Hoàn thành bảng sau:",
    "",
    "| Giai đoạn | Điểm |",
    "| --- | --- |",
    "| Phát triển | 0,25 |",
    "| Kết quả | 0,25 |",
    "",
    "Giải thích lựa chọn của em.",
  ].join("\n");
  const b = splitTableBlocks(src);
  check("cắt ra 3 mảng: chữ · bảng · chữ", b.length === 3, b.map((x) => x.kind).join(","));
  check("mảng giữa là bảng", b[1].kind === "table");
  check("bảng có 3 hàng (hàng ngăn cách bị loại)", b[1].rows.length === 3, String(b[1].rows.length));
  check("hàng đầu là tiêu đề cột", b[1].rows[0].join("·") === "Giai đoạn·Điểm", b[1].rows[0].join("·"));
  check("chữ trước bảng giữ nguyên", b[0].body.includes("Hoàn thành bảng sau:"));
  check("chữ sau bảng giữ nguyên", b[2].body.includes("Giải thích lựa chọn"));
}

/* ── 5. Mốc vị trí trong chuỗi GỐC ─────────────────────────────────────── */
// Ô soạn thảo cho bấm vào công thức để sửa tại chỗ, định vị bằng khoảng ký
// tự. Mảng văn bản sau bảng mà báo mốc tính từ 0 thì bấm vào công thức ở đó
// sẽ ghi đè nhầm sang đầu bài.
{
  const src = "Mở đầu.\n| a | b |\n| --- | --- |\n| c | d |\nKết luận $x^2$ nhé.";
  const b = splitTableBlocks(src);
  check("mảng đầu bắt đầu ở 0", b[0].start === 0, String(b[0].start));
  check(
    "mảng chữ SAU bảng mang đúng mốc gốc",
    src.slice(b[2].start).startsWith("Kết luận"),
    JSON.stringify(src.slice(b[2].start, b[2].start + 12)),
  );
  check("thân mảng chữ đúng là lát cắt của chuỗi gốc", src.slice(b[2].start) === b[2].body);
}

/* ── 6. Không đủ điều kiện thì TRẢ CHỮ VỀ, không nuốt ──────────────────── */
{
  // Một dòng gạch đứng lẻ: không thành bảng, nhưng cũng không được biến mất.
  const src = "Trước\n| chỉ | một hàng |\nSau";
  const b = splitTableBlocks(src);
  check("một hàng lẻ không thành bảng", b.every((x) => x.kind === "text"));
  check("…và chữ không bị nuốt mất", b.map((x) => x.body).join("\n") === src, JSON.stringify(b.map((x) => x.body).join("\n")));
}
check("chuỗi rỗng → không vỡ", splitTableBlocks("").length <= 1);
check("nội dung thường: không có bảng", hasDataTable("Câu hỏi bình thường thôi.") === false);
check("nội dung có bảng", hasDataTable("| a | b |\n| --- | --- |\n| c | d |") === true);

/* ── 7. Bẻ phẳng cho dòng xem trước ────────────────────────────────────── */
{
  const lines = tableToPlainLines([["Giai đoạn", "Điểm"], ["Phát triển", "0,25"]]);
  check("mỗi hàng một dòng", lines.length === 2);
  check("ô ngăn bằng ' · ' để còn thấy ranh giới cột", lines[0] === "Giai đoạn · Điểm", lines[0]);
}

/* ── 8. Ở ĐÚNG ranh giới nhập: HTML của Word → văn bản ─────────────────── */
// Thư viện thuần ở trên đúng chưa đủ — chỗ hay sai là lúc nối vào
// `htmlToMarkedText`, nơi mọi thẻ bị bẻ phẳng. Bảng phải được đổi TRƯỚC bước
// đó, vì `</p>` và tab đều thành xuống dòng: chạy sau thì mỗi ô đã là một
// dòng riêng, không dựng lại được hàng.
{
  const out2 = join(mkdtempSync(join(tmpdir(), "fsc-marked-")), "m.mjs");
  execFileSync(
    "npx",
    [
      "esbuild",
      "src/features/question-bank/lib/parse-exam-bank.ts",
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--alias:@=./src",
      `--outfile=${out2}`,
    ],
    { cwd: "apps/web", stdio: "pipe" },
  );
  const { htmlToMarkedText } = await import(out2);

  // Bảng XẾP CHỖ 1×2 — khối tiêu đề đầu đề của đề SHOC 10.
  {
    const html =
      "<table><tr><td><p>SỞ GIÁO DỤC VÀ ĐÀO TẠO</p></td>" +
      "<td><p>KIỂM TRA GIỮA HỌC KÌ II</p></td></tr></table>";
    const t = htmlToMarkedText(html);
    check("khối tiêu đề 1×2 KHÔNG thành bảng", !t.includes("|"), JSON.stringify(t));
    check("…và chữ vẫn còn đủ", t.includes("SỞ GIÁO DỤC") && t.includes("KIỂM TRA"));
  }

  // Bảng XẾP CHỖ 1×4 — bốn phương án nằm ngang, kiểu file AIMO.
  {
    const html =
      "<table><tr><td><p>A: $466</p></td><td><p>B: $200</p></td>" +
      "<td><p>C: $400</p></td><td><p>D: $240</p></td></tr></table>";
    const t = htmlToMarkedText(html);
    check("bốn phương án nằm ngang KHÔNG thành bảng", !t.includes("|"), JSON.stringify(t));
  }

  // Bảng DỮ LIỆU 3×4 — bảng lời giải, kiểu đề SHOC 10 / AIMO.
  {
    const html =
      "<table>" +
      "<tr><td><p>Các giai đoạn</p></td><td><p>Giao tử đực</p></td><td><p>Điểm</p></td></tr>" +
      "<tr><td><p>Phát triển</p></td><td><p>Từ 1 tế bào mầm</p></td><td><p>0,25</p></td></tr>" +
      "<tr><td><p>Kết quả</p></td><td><p>4 tinh trùng</p></td><td><p>0,25</p></td></tr>" +
      "</table>";
    const t = htmlToMarkedText(html);
    const b = splitTableBlocks(t).filter((x) => x.kind === "table");
    check("bảng lời giải nhiều hàng THÀNH bảng", b.length === 1, String(b.length));
    check("đủ 3 hàng", b[0]?.rows.length === 3, String(b[0]?.rows.length));
    check("đủ 3 cột", b[0]?.rows[0].length === 3, String(b[0]?.rows[0].length));
    check("ô giữ nguyên chữ", b[0]?.rows[1][1] === "Từ 1 tế bào mầm", b[0]?.rows[1][1]);
    check("cột điểm đúng", b[0]?.rows[2][2] === "0,25", b[0]?.rows[2][2]);
  }

  // Ô nhiều đoạn: xuống dòng giữa ô thì hàng vỡ làm đôi.
  {
    const html =
      "<table>" +
      "<tr><td><p>Giai đoạn</p></td><td><p>Mô tả</p></td></tr>" +
      "<tr><td><p>Phát triển</p></td><td><p>Dòng một.</p><p>Dòng hai.</p></td></tr>" +
      "</table>";
    const b = splitTableBlocks(htmlToMarkedText(html)).filter((x) => x.kind === "table");
    check("ô nhiều đoạn KHÔNG xé hàng làm đôi", b[0]?.rows.length === 2, String(b[0]?.rows.length));
    check(
      "…hai đoạn gộp lại trong một ô",
      b[0]?.rows[1][1] === "Dòng một. Dòng hai.",
      b[0]?.rows[1][1],
    );
  }

  // Bảng phải đứng thành khối riêng, không dính câu chữ ngay trên nó.
  {
    const html =
      "<p>Hoàn thành bảng sau:</p><table>" +
      "<tr><td><p>a</p></td><td><p>b</p></td></tr>" +
      "<tr><td><p>c</p></td><td><p>d</p></td></tr></table>";
    const blocks = splitTableBlocks(htmlToMarkedText(html));
    check(
      "câu dẫn không bị hút vào hàng đầu của bảng",
      blocks[0]?.kind === "text" && blocks[0].body.includes("Hoàn thành bảng sau:"),
      JSON.stringify(blocks[0]),
    );
    check("…và bảng vẫn đủ 2 hàng", blocks[1]?.kind === "table" && blocks[1].rows.length === 2);
  }
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
