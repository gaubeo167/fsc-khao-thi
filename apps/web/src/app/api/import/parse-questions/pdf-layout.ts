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

function renderLine(line: PdfTextItem[], fonts: Map<string, SymbolFont>): string {
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
    // Số mũ: nhỏ hơn chữ thân VÀ nâng cao hơn đường chân chữ.
    const isSup = it.size < 0.85 * body && it.y > baseline + 0.1 * body;
    if (isSup) {
      pendingSup += text.trim();
    } else {
      flushSup();
      if (spaced && !/^\s/.test(text) && !/\s$/.test(out)) out += " ";
      out += text;
    }
    prevEnd = it.x + it.width;
  }
  flushSup();
  return out.replace(/[ \t]+/g, " ").trimEnd();
}

/** Các mẩu chữ của MỘT trang → văn bản đã xếp đúng hàng, đúng thứ tự. */
export function layoutPdfPage(items: PdfTextItem[]): string {
  const usable = items.filter((it) => it.str !== "");
  if (usable.length === 0) return "";
  const fonts = classifySymbolFonts(usable);
  return groupLines(usable)
    .map((line) => renderLine(line, fonts))
    .filter((l) => l.trim())
    .join("\n");
}
