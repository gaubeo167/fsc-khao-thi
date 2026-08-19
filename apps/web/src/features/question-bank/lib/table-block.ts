/**
 * BẢNG trong nội dung câu hỏi — một cách viết duy nhất cho cả ba đường.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Đề Word dùng bảng cho HAI việc khác hẳn nhau:
 *
 *   1. XẾP CHỖ — bảng 1 hàng. Khối tiêu đề đầu đề ("SỞ GIÁO DỤC…" bên trái,
 *      "KIỂM TRA GIỮA HỌC KÌ II…" bên phải) là một bảng 1×2. Bốn phương án
 *      xếp thành hàng ngang là một bảng 1×4 — file AIMO có 16 bảng như vậy.
 *      Những bảng này KHÔNG phải bảng: bẻ phẳng thành dòng mới đúng, và bộ
 *      đọc phương án đang dựa vào đúng điều đó.
 *
 *   2. DỮ LIỆU THẬT — bảng nhiều hàng nhiều cột. Bảng "Các giai đoạn / Sự
 *      phát sinh giao tử đực / … / Điểm" trong lời giải đề SHOC 10 (5×4), hay
 *      bảng "Speed / Time / Distance" trong đề AIMO (3×4). Bẻ phẳng là mất
 *      hẳn nghĩa: bốn ô của một hàng dính thành một dòng chữ, không còn biết
 *      ô nào thuộc cột nào.
 *
 * Ranh giới: **≥2 hàng VÀ ≥2 cột** thì là bảng dữ liệu. Đo trên toàn bộ đề
 * mẫu đang có, luật này chia đúng 100%: 17 bảng xếp chỗ ở lại dạng phẳng, 2
 * bảng dữ liệu thành bảng thật.
 *
 * ── Cách viết ───────────────────────────────────────────────────────────
 *
 * Kiểu gạch đứng của Markdown, vì nội dung câu hỏi vốn là VĂN BẢN có mốc
 * (`$…$`, `[blank:1]`, `![](…)`) chứ không phải HTML:
 *
 *     | Các giai đoạn | Sự phát sinh giao tử đực | Điểm |
 *     | --- | --- | --- |
 *     | Phát triển | Từ 1 tế bào mầm… | 0,25 |
 *
 * Người soạn sửa được bằng tay ngay trong ô soạn thảo, và mọi mốc sẵn có vẫn
 * chạy trong từng ô vì ô được đưa lại cho đúng bộ hiển thị cũ.
 */

/** Bảng dữ liệu phải có ít nhất ngần này hàng. */
export const MIN_TABLE_ROWS = 2;
/** …và ít nhất ngần này cột. */
export const MIN_TABLE_COLS = 2;

/** Hàng ngăn cách của Markdown: `| --- | --- |`. */
const SEPARATOR_CELL_RE = /^:?-{3,}:?$/;

/**
 * Bảng này có đáng dựng thành bảng thật không, hay chỉ là cách xếp chỗ.
 *
 * Đếm cột theo hàng RỘNG NHẤT: bảng thật hay có ô gộp làm hàng đầu ngắn hơn,
 * lấy hàng đầu làm chuẩn thì bỏ sót.
 */
export function isDataTable(rows: readonly (readonly string[])[]): boolean {
  if (rows.length < MIN_TABLE_ROWS) return false;
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  return cols >= MIN_TABLE_COLS;
}

/** Ô có chứa gạch đứng thì phải che, không thì hàng bị tách sai cột. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function unescapeCell(cell: string): string {
  return cell.replace(/\\\|/g, "|").trim();
}

/** Mảng ô → đoạn văn bản kiểu gạch đứng. */
export function toPipeTable(rows: readonly (readonly string[])[]): string {
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: cols }, (_, i) => escapeCell(cells[i] ?? "")).join(" | ")} |`;
  const [head, ...rest] = rows;
  return [
    line(head ?? []),
    `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`,
    ...rest.map(line),
  ].join("\n");
}

/**
 * Dòng này có phải một hàng của bảng không.
 *
 * Đòi gạch đứng ở CẢ HAI đầu. Nới ra thì câu hỏi có chứa `|` (giá trị tuyệt
 * đối, xác suất có điều kiện `P(A|B)`) bị nhận nhầm thành bảng.
 */
export function isTableRowLine(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 3) return false;
  return splitRow(t).length >= MIN_TABLE_COLS;
}

/** Tách một hàng thành các ô, bỏ qua gạch đứng đã bị che bằng `\`. */
function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === "\\" && t[i + 1] === "|") {
      buf += "\\|";
      i += 1;
    } else if (c === "|") {
      cells.push(unescapeCell(buf));
      buf = "";
    } else {
      buf += c;
    }
  }
  cells.push(unescapeCell(buf));
  return cells;
}

function isSeparatorLine(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL_RE.test(c.trim()));
}

export type ContentBlock =
  | { kind: "text"; body: string; start: number }
  | { kind: "table"; rows: string[][]; start: number };

/**
 * Cắt nội dung thành các mảng văn bản và bảng.
 *
 * Chạy trên DÒNG, trước khi tách công thức — nếu tách công thức trước thì một
 * ô có `$x$` sẽ xé đôi hàng và bảng vỡ.
 *
 * Chuỗi dòng-bảng liền nhau nào không đủ hàng/cột thì TRẢ LẠI nguyên văn bản,
 * không nuốt mất chữ của người soạn.
 */
export function splitTableBlocks(source: string): ContentBlock[] {
  const src = source ?? "";
  const lines = src.split(/\r?\n/);
  const out: ContentBlock[] = [];
  // Vị trí ký tự đầu mỗi dòng trong chuỗi GỐC. Ô soạn thảo cho bấm vào công
  // thức để sửa tại chỗ, và nó định vị bằng khoảng ký tự — mảng văn bản mà
  // không mang theo mốc gốc thì bấm vào công thức ở mảng thứ hai trở đi sẽ
  // ghi đè nhầm chỗ.
  const offsets: number[] = [];
  let at = 0;
  for (const l of lines) {
    offsets.push(at);
    at += l.length + 1;
  }

  let text: number[] = [];
  let run: number[] = [];

  const flushText = () => {
    if (text.length > 0) {
      out.push({
        kind: "text",
        body: text.map((i) => lines[i] ?? "").join("\n"),
        start: offsets[text[0] as number] as number,
      });
      text = [];
    }
  };
  const flushRun = () => {
    if (run.length === 0) return;
    const rows = run
      .map((i) => lines[i] ?? "")
      .filter((l) => !isSeparatorLine(l))
      .map(splitRow);
    if (isDataTable(rows)) {
      flushText();
      out.push({ kind: "table", rows, start: offsets[run[0] as number] as number });
    } else {
      // Không đủ để thành bảng — trả nguyên chữ về dòng văn bản.
      text.push(...run);
    }
    run = [];
  };

  lines.forEach((line, i) => {
    if (isTableRowLine(line) || (run.length > 0 && isSeparatorLine(line))) {
      run.push(i);
    } else {
      flushRun();
      text.push(i);
    }
  });
  flushRun();
  flushText();
  return out;
}

/** Có bảng dữ liệu nào trong nội dung này không. */
export function hasDataTable(source: string): boolean {
  return splitTableBlocks(source).some((b) => b.kind === "table");
}

/**
 * Bảng → các dòng chữ, cho những chỗ KHÔNG dựng được bảng thật (dòng xem
 * trước trong danh sách). Ô ngăn bằng " · " để còn đọc ra ranh giới cột.
 */
export function tableToPlainLines(rows: readonly (readonly string[])[]): string[] {
  return rows.map((r) => r.map((c) => c.trim()).filter(Boolean).join(" · "));
}

/* ────────────────────────────────────────────────────────────────────────
 * Cầu nối với ô soạn thảo
 *
 * Ô soạn thảo là contentEditable: chuỗi → HTML để hiện, HTML → chuỗi để lưu.
 * Hai hàm dưới giữ phần LOGIC của chiều đó ở đây, tách khỏi DOM, để test
 * được mà không cần dựng cả trình duyệt.
 *
 * Chiều lưu là chiều nguy hiểm: đọc sai một cái thì MỖI LẦN GÕ một chữ trong
 * ô đều ghi lại nội dung câu hỏi sai đi.
 * ──────────────────────────────────────────────────────────────────────── */

/** Đủ để nhận ra ô và duyệt con — hợp với cả DOM thật lẫn vật giả trong test. */
export interface CellLike {
  tagName: string;
}
export interface RowLike {
  children: ArrayLike<CellLike>;
}

/**
 * Các hàng trong DOM → đoạn văn bản kiểu gạch đứng.
 *
 * `readCell` do chỗ gọi đưa vào vì ô soạn thảo phải đọc được cả thẻ công thức
 * bên trong ô, không chỉ chữ trần.
 *
 * Trả "" khi bảng rỗng — chỗ gọi bỏ hẳn đi thay vì ghi ra một bảng không ô.
 */
export function pipeFromRows(
  rows: ArrayLike<RowLike>,
  readCell: (cell: CellLike) => string,
): string {
  const out: string[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    const cells: string[] = [];
    for (let j = 0; j < r.children.length; j += 1) {
      const c = r.children[j];
      if (!c) continue;
      const tag = c.tagName.toUpperCase();
      if (tag !== "TD" && tag !== "TH") continue;
      // Một ô là MỘT dòng trong cú pháp gạch đứng. Xuống dòng trong ô phải
      // gộp lại, không thì lúc đọc ngược hàng vỡ làm đôi.
      cells.push(readCell(c).replace(/\s+/g, " ").trim());
    }
    if (cells.length > 0) out.push(cells);
  }
  return out.length > 0 ? toPipeTable(out) : "";
}

/** Lớp CSS của ô bảng trong ô soạn thảo — thân và tiêu đề. */
export const EDITOR_TD_CLASS = "border border-border px-2 py-1 align-top min-w-[4rem]";
export const EDITOR_TH_CLASS = `${EDITOR_TD_CLASS} bg-muted/50 font-semibold`;

/**
 * Bảng → HTML gõ được của ô soạn thảo.
 *
 * `renderCell` do chỗ gọi đưa vào để nội dung ô đi qua đúng bộ dựng thẻ —
 * công thức trong ô vẫn thành thẻ bấm sửa được.
 *
 * Ô KHÔNG khoá `contenteditable`: người soạn phải gõ thẳng vào ô được. Chỉ
 * thanh nút mới khoá, và nó mang `data-table-ui` để lúc lưu bị bỏ qua.
 */
export function tableHtml(
  rows: readonly (readonly string[])[],
  renderCell: (cell: string) => string,
  toolbarHtml = "",
): string {
  const body = rows
    .map((r, ri) => {
      const cls = ri === 0 ? EDITOR_TH_CLASS : EDITOR_TD_CLASS;
      const cells = r
        .map((c) => `<td class="${cls}">${renderCell(c) || "<br>"}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return (
    `<div data-table-wrap="1" class="fsc-table-wrap group/tbl relative my-2 overflow-x-auto">` +
    toolbarHtml +
    `<table data-table="1" class="w-full border-collapse border border-border text-left">` +
    `<tbody>${body}</tbody></table></div>`
  );
}
