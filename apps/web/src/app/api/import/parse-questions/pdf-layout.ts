/**
 * Dựng lại chữ của một trang PDF theo TOẠ ĐỘ, thay vì theo thứ tự trong file.
 *
 * ── Vì sao ──────────────────────────────────────────────────────────────────
 *
 * Word xuất PDF thì công thức MathType không còn là một khối, nó vỡ thành từng
 * mẩu chữ rời, và thứ tự trong file KHÔNG phải thứ tự đọc. Rút chữ theo thứ tự
 * file thì `n∈ℕ, n(n+1)` ra thành:
 *
 *     C.  , 1n n n   chia hết cho 2.
 *
 * Số mũ còn tệ hơn: nó nhảy hẳn lên dòng trước (`D. 2` rồi mới `x x x`). Trong
 * khi mỗi mẩu chữ đều mang sẵn x, y và cỡ chữ — đủ để xếp lại đúng hàng, đúng
 * thứ tự, và nhận ra cái nào là số mũ.
 *
 * Thêm một tầng nữa: ký hiệu toán trong PDF của Word mang mã vùng riêng
 * `U+F0xx` của font Symbol / MT Extra. Không đổi lại thì chúng là ký tự vô
 * hình — công thức "biến mất" dù chữ vẫn nằm trong file (xem `symbol-fonts.ts`).
 */

import {
  U_CLOSE,
  U_OPEN,
} from "@/features/question-bank/lib/parse-exam-bank";
import {
  guessSymbolFont,
  symbolCharToUnicode,
  type SymbolFont,
} from "@/features/question-bank/lib/symbol-fonts";

/** Một mẩu chữ pdf.js trả về, đã rút gọn còn thứ cần dùng. */
export interface PdfTextItem {
  str: string;
  /** Toạ độ điểm đặt chữ. Trong PDF, y LỚN hơn là CAO hơn. */
  x: number;
  y: number;
  /** Cỡ chữ đã nhân ma trận biến đổi. */
  size: number;
  /** Bề rộng mẩu chữ, dùng để biết giữa hai mẩu có dấu cách hay không. */
  width: number;
  /** Khoá font do pdf.js đặt (`g_d0_f4`…). Tên font thật không lấy được. */
  fontKey: string;
}

/**
 * Một nét NGANG MẢNH trên trang — ứng viên gạch chân.
 *
 * Trong đề của trường, đáp án đúng được GẠCH CHÂN. Word lưu nó thành thuộc
 * tính của chữ nên đọc thẳng được; PDF thì chỉ còn một nét vẽ ở toạ độ nào đó,
 * không dính gì tới chữ. Nhưng khớp lại được: nét nằm ngay dưới chân chữ và
 * trùng bề ngang với chữ đó thì chính là gạch chân của chữ đó.
 */
export interface PdfRule {
  x0: number;
  x1: number;
  y: number;
}

/** Một ảnh trên trang, để cắm mốc vào đúng dòng. */
export interface PdfImageBox {
  marker: string;
  x: number;
  /** Mép DƯỚI của ảnh, cùng hệ toạ độ với chân chữ. */
  y: number;
  width: number;
  height: number;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** Ký tự vùng riêng của font ký hiệu — `U+F020`…`U+F0FF`. */
const isPua = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0xf000 && c <= 0xf0ff;
};

/**
 * Xem mỗi khoá font là Symbol hay MT Extra, dựa trên TẬP MÃ nó dùng trong cả
 * tài liệu (pdf.js không trả tên font ra ở môi trường máy chủ).
 */
export function classifySymbolFonts(items: PdfTextItem[]): Map<string, SymbolFont> {
  const codesByKey = new Map<string, Set<number>>();
  for (const it of items) {
    for (const ch of it.str) {
      if (!isPua(ch)) continue;
      const set = codesByKey.get(it.fontKey) ?? new Set<number>();
      set.add(ch.codePointAt(0)!);
      codesByKey.set(it.fontKey, set);
    }
  }
  // Lượt 1: khoá nào CHẮC CHẮN là Symbol — có glyph ở vùng ASCII (dấu ngoặc,
  // dấu cộng, dấu bằng). MT Extra không đặt glyph ở vùng đó.
  const out = new Map<string, SymbolFont>();
  const hasAscii = (codes: Set<number>) =>
    [...codes].some((c) => {
      const b = c >= 0xf000 && c <= 0xf0ff ? c - 0xf000 : c;
      return b >= 0x20 && b <= 0x7f;
    });
  let hasSymbol = false;
  for (const [key, codes] of codesByKey) {
    if (hasAscii(codes)) {
      out.set(key, "symbol");
      hasSymbol = true;
    }
  }
  // Lượt 2: khoá chỉ dùng mã cao. Trong tài liệu đã có font Symbol rồi thì
  // khoá này là MT Extra; không thì coi là Symbol (phổ biến hơn hẳn).
  for (const [key, codes] of codesByKey) {
    if (!out.has(key)) out.set(key, guessSymbolFont(codes, hasSymbol));
  }
  return out;
}

/** Đổi ký tự vùng riêng sang Unicode; mã lạ thì BỎ (không in ra ký tự sai). */
function decodeItem(it: PdfTextItem, fonts: Map<string, SymbolFont>): string {
  if (![...it.str].some(isPua)) return it.str;
  const font = fonts.get(it.fontKey) ?? "symbol";
  let out = "";
  for (const ch of it.str) {
    if (!isPua(ch)) {
      out += ch;
      continue;
    }
    out += symbolCharToUnicode(ch.codePointAt(0)!, font) ?? "";
  }
  return out;
}

/** Chia các mẩu chữ thành DÒNG theo y, rồi xếp trong dòng theo x. */
function groupLines(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    // Chữ nhỏ nâng lên (số mũ) vẫn phải nằm CÙNG dòng, nên dung sai phải lớn
    // hơn độ nâng của số mũ (~0,3em) mà vẫn nhỏ hơn khoảng cách dòng (~1,15em).
    const tol = 0.6 * Math.max(it.size, line?.[0]?.size ?? it.size);
    if (line && Math.abs(line[0]!.y - it.y) <= tol) line.push(it);
    else lines.push([it]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** Cỡ chữ THÂN của dòng: cỡ mà phần đông ký tự dùng. */
function bodySize(line: PdfTextItem[]): number {
  const tally = new Map<number, number>();
  for (const it of line) {
    const k = Math.round(it.size * 2) / 2;
    tally.set(k, (tally.get(k) ?? 0) + it.str.length);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
}

/** Nét nào là gạch chân của mẩu chữ này? */
function isUnderlineOf(rule: PdfRule, it: PdfTextItem, text: string): boolean {
  if (!text.trim()) return false;
  const below = it.y - rule.y;
  // Gạch chân nằm dưới chân chữ vài phần mười em. Nới quá thì ăn cả đường kẻ
  // bảng và dòng kẻ "Số báo danh: ......" ở đầu đề.
  if (below < 0.02 * it.size || below > 0.35 * it.size) return false;
  const itemEnd = it.x + it.width;
  const overlap = Math.min(itemEnd, rule.x1) - Math.max(it.x, rule.x0);
  return overlap > 0.4 * Math.min(it.width, rule.x1 - rule.x0);
}

function renderLine(
  line: PdfTextItem[],
  fonts: Map<string, SymbolFont>,
  rules: PdfRule[],
): string {
  const body = bodySize(line);
  const baseline = line.find((it) => Math.round(it.size * 2) / 2 === body)?.y ?? line[0]!.y;

  let out = "";
  let prevEnd: number | null = null;
  let pendingSup = "";
  const flushSup = () => {
    if (!pendingSup) return;
    const asDigits = [...pendingSup].every((c) => SUPERSCRIPT_DIGITS[c]);
    out += asDigits
      ? [...pendingSup].map((c) => SUPERSCRIPT_DIGITS[c]).join("")
      : `^{${pendingSup}}`;
    pendingSup = "";
  };

  for (const it of line) {
    const text = decodeItem(it, fonts);
    if (!text) continue;
    // Khoảng trắng thật giữa hai mẩu: tính theo khoảng hở, không theo ký tự.
    const gap = prevEnd == null ? 0 : it.x - prevEnd;
    const spaced = prevEnd != null && gap > 0.25 * body;
    // Khoảng hở RỘNG = hai cột, không phải một dấu cách. Bộ tách phương án
    // đọc "A. … B. …" trên cùng một dòng nhờ tab hoặc từ hai dấu cách trở
    // lên; nuốt mất khoảng hở đó là bốn phương án hai cột thành ba.
    const wideGap = prevEnd != null && gap > 1.5 * body;
    // Số mũ: nhỏ hơn chữ thân VÀ nâng cao hơn đường chân chữ.
    const isSup = it.size < 0.85 * body && it.y > baseline + 0.1 * body;
    if (isSup) {
      pendingSup += text.trim();
    } else {
      flushSup();
      // Cột cách nhau bằng TAB: bước chuẩn hoá gộp mọi dấu cách liền nhau về
      // một, nên hai dấu cách không sống sót — tab thì có, và bộ tách phương
      // án đọc tab đúng như đọc tab của Word.
      if (spaced && !/^\s/.test(text) && !/\s$/.test(out)) out += wideGap ? "\t" : " ";
      // Gạch chân = đáp án đúng. Bọc bằng đúng mốc mà đường Word dùng, để
      // parser nhận ra bằng một luật chung chứ không phải hai luật song song.
      const underlined = rules.some((r) => isUnderlineOf(r, it, text));
      out += underlined ? `${U_OPEN}${text}${U_CLOSE}` : text;
    }
    prevEnd = it.x + it.width;
  }
  flushSup();
  return out.replace(/ {2,}/g, " ").trimEnd();
}

/**
 * Gắn mỗi ảnh vào dòng chữ của NÓ.
 *
 * Hai kiểu bày phương án bằng hình, đề nào cũng gặp cả hai:
 *
 *   · hình thấp, nhãn "A." nằm NGANG hàng với hình → chân chữ nằm trong vùng
 *     cao của hình;
 *   · hình cao xếp hai cột, nhãn nằm NGAY TRÊN hình.
 *
 * Nên nhận cả hai: dòng nào có chân chữ nằm trong vùng hình, hoặc ngay phía
 * trên mép hình, thì hình thuộc về dòng đó. Không dòng nào hợp thì hình đứng
 * riêng một dòng, giữ đúng thứ tự trên trang.
 */
function attachImages(
  lines: PdfTextItem[][],
  images: PdfImageBox[],
): PdfTextItem[][] {
  const out = lines.map((l) => [...l]);
  const loose: PdfImageBox[] = [];
  for (const img of images) {
    const top = img.y + img.height;
    let best = -1;
    let bestGap = Infinity;
    out.forEach((line, i) => {
      const baseline = line[0]?.y ?? 0;
      const inside = baseline >= img.y - 2 && baseline <= top;
      const justAbove = baseline > top && baseline - top <= 16;
      if (!inside && !justAbove) return;
      const gap = inside ? 0 : baseline - top;
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    const item: PdfTextItem = {
      str: img.marker,
      x: img.x,
      y: best >= 0 ? out[best]![0]!.y : img.y,
      size: 12,
      width: img.width,
      fontKey: "",
    };
    if (best >= 0) out[best]!.push(item);
    else loose.push(img);
  }
  for (const img of loose) {
    out.push([
      { str: img.marker, x: img.x, y: img.y, size: 12, width: img.width, fontKey: "" },
    ]);
  }
  // Ảnh vừa chèn phải về đúng chỗ theo chiều ngang trong dòng.
  for (const line of out) line.sort((a, b) => a.x - b.x);
  return out.sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0));
}

/** Các mẩu chữ của MỘT trang → văn bản đã xếp đúng hàng, đúng thứ tự. */
export function layoutPdfPage(
  items: PdfTextItem[],
  rules: PdfRule[] = [],
  images: PdfImageBox[] = [],
): string {
  const usable = items.filter((it) => it.str !== "");
  if (usable.length === 0 && images.length === 0) return "";
  const fonts = classifySymbolFonts(usable);
  return attachImages(groupLines(usable), images)
    .map((line) => renderLine(line, fonts, rules))
    .filter((l) => l.trim())
    .join("\n");
}
