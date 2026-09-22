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
import { unicodeToLatex } from "@/features/question-bank/lib/mtef-to-latex";
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

/**
 * Mẩu chữ này có phải MỘT MẢNH của dấu ngoặc nhọn kéo dài không?
 *
 * Hệ phương trình trong Word là một khối; sang PDF nó vỡ ra: dấu ngoặc nhọn
 * thành hai ba mảnh xếp dọc (font Symbol, mã 0xEC/0xED/0xEE — sau khi đổi mã
 * thành `{`, `|`, `}`), mỗi dòng của hệ nằm trên một đường chân chữ riêng.
 */
function isFencePiece(it: PdfTextItem, fonts: Map<string, SymbolFont>): boolean {
  if (fonts.get(it.fontKey) !== "symbol") return false;
  const t = decodeItem(it, fonts).trim();
  return t.length === 1 && (t === "{" || t === "}" || t === "|");
}

/** Một dòng của hệ → LaTeX. */
function rowToLatex(items: PdfTextItem[], fonts: Map<string, SymbolFont>): string {
  const body = bodySize(items);
  const baseline = items[0]?.y ?? 0;
  let out = "";
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const text = decodeItem(it, fonts);
    if (!text.trim()) continue;
    const sup = it.size < 0.85 * body && it.y > baseline + 0.1 * body;
    let tex = "";
    try {
      tex = [...text.trim()].map(unicodeToLatex).join("");
    } catch {
      return "";
    }
    out += sup ? `^{${tex}}` : tex;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Gộp hệ phương trình bị vỡ thành `$\begin{cases}…\end{cases}$`.
 *
 * Trong PDF, một hệ hai dòng hiện ra thành ba dòng chữ rời: dòng trên của hệ,
 * dòng văn xuôi mang mảnh giữa của dấu ngoặc, dòng dưới của hệ. Đọc thẳng thì
 * ra "…hệ bất phương trình | ?" rồi "{ x ≥ y−3" nằm lạc một dòng khác.
 *
 * Nhận ra bằng hình học: các mảnh ngoặc xếp dọc CÙNG MỘT CỘT trên những dòng
 * liền nhau; mọi thứ bên phải cột đó là các dòng của hệ; dòng nào còn chữ ở
 * BÊN TRÁI cột thì đó là câu văn chứa hệ.
 */
function mergeBraceSystems(
  lines: PdfTextItem[][],
  fonts: Map<string, SymbolFont>,
): PdfTextItem[][] {
  const fenceAt = lines.map((line) => line.filter((it) => isFencePiece(it, fonts)));
  const used = new Set<number>();
  const out: PdfTextItem[][] = lines.map((l) => [...l]);

  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    for (const first of fenceAt[i] ?? []) {
      // Gom các mảnh cùng cột trên những dòng liền ngay dưới.
      const group = [{ line: i, item: first }];
      for (let j = i + 1; j < lines.length; j += 1) {
        const hit = (fenceAt[j] ?? []).find((f) => Math.abs(f.x - first.x) <= 3);
        if (!hit) break;
        group.push({ line: j, item: hit });
      }
      if (group.length < 2) continue;

      const colX = first.x;
      // Dòng nào còn chữ BÊN TRÁI cột ngoặc thì đó là câu văn chứa hệ; phần
      // bên phải của chính dòng đó là câu viết tiếp, KHÔNG phải một dòng hệ.
      const host = group.find((g) =>
        out[g.line]!.some((it) => it !== g.item && it.x < colX),
      );
      if (!host) continue;

      const rows: string[] = [];
      for (const g of group) {
        if (g.line === host.line) continue;
        const right = out[g.line]!.filter((it) => it !== g.item && it.x > colX);
        const tex = rowToLatex(right, fonts);
        // "( )" là nhãn (1) của hệ, không phải một dòng — bỏ những mẩu không
        // có chữ hay số nào.
        if (tex && /[0-9A-Za-z]/.test(tex)) rows.push(tex);
      }
      if (rows.length < 2) continue;

      const cases = `$\\begin{cases}${rows.join(" \\\\ ")}\\end{cases}$`;
      for (const g of group) {
        const line = out[g.line]!;
        if (g.line === host.line) {
          const at = line.indexOf(g.item);
          line[at] = { ...g.item, str: cases, fontKey: "" };
        } else {
          out[g.line] = line.filter((it) => it.x < colX && it !== g.item);
        }
        used.add(g.line);
      }
      break;
    }
  }
  return out.filter((l) => l.length > 0);
}

/**
 * Tách mẩu chữ NHIỀU KÝ TỰ khi có mẩu khác vẽ chèn vào giữa nó.
 *
 * Word gộp các glyph cùng font thành một mẩu, kể cả khi giữa chúng còn glyph
 * của font khác. Công thức `∃x∈ℕ` ra hai mẩu: "∃ ∈" (font Symbol, trải từ
 * x=135 tới x=156) và "x" (font nghiêng, vẽ ở x=142 — NẰM GIỮA mẩu kia). Xếp
 * theo điểm bắt đầu thì thành "∃ ∈x", sai thứ tự đọc.
 *
 * Chỉ tách khi thật sự có chữ chen vào (2% số cặp trong đề thật), và ước
 * lượng vị trí từng ký tự bằng bề rộng chia đều — đủ để xếp đúng thứ tự.
 */
function splitInterleaved(line: PdfTextItem[]): PdfTextItem[] {
  const out: PdfTextItem[] = [];
  for (const it of line) {
    const chars = [...it.str];
    const intruded =
      chars.length > 1 &&
      it.width > 0 &&
      line.some((o) => o !== it && o.x > it.x + 0.5 && o.x < it.x + it.width - 0.5);
    if (!intruded) {
      out.push(it);
      continue;
    }
    const step = it.width / chars.length;
    chars.forEach((ch, i) => {
      out.push({ ...it, str: ch, x: it.x + i * step, width: step });
    });
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
  return lines.map((line) => splitInterleaved(line).sort((a, b) => a.x - b.x));
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

/** Một ký tự của dòng, kèm chỗ nó đến từ đâu. */
interface Glyph {
  ch: string;
  /** Đến từ font toán (Symbol / MT Extra) hoặc là số mũ — mốc nhận ra công thức. */
  anchor: boolean;
  sup: boolean;
}

/** Ký tự được phép nằm TRONG công thức dù không phải ký hiệu toán. */
const MATH_PUNCT = new Set([
  ..."+-−*/=<>≤≥≠≈±∓×÷^_(){}[]|,;:'\"",
  ..."∀∃∈∉∅∪∩⊂⊆⊃⇒⇔→∞√∑∏∫°∠△⋅",
]);

const isDigit = (c: string) => c >= "0" && c <= "9";
const isLatinLetter = (c: string) => /^[A-Za-z]$/.test(c);
const isLetter = (c: string) => /\p{L}/u.test(c);

/**
 * Bọc các đoạn công thức trong dòng bằng `$…$`.
 *
 * PDF không đánh dấu đâu là công thức, nhưng nó có một dấu vết chắc chắn:
 * ký hiệu toán được vẽ bằng font Symbol / MT Extra, còn câu văn tiếng Việt
 * thì không. Lấy những ký hiệu đó làm MỐC rồi mở rộng sang hai bên qua các
 * ký tự còn có thể là công thức — chữ cái ĐƠN, chữ số, dấu phép toán — và
 * dừng lại ở từ tiếng Việt (chuỗi từ hai chữ cái trở lên) hoặc dấu kết câu.
 *
 * Cố ý dè dặt: không có mốc thì không bọc. Đoán bừa ranh giới công thức
 * giữa câu văn thì tệ hơn là để nguyên chữ, vì đề thi không ai soát lại.
 */
function wrapMathSpans(glyphs: Glyph[]): string {
  const n = glyphs.length;
  // 1. Chữ cái đứng một mình là biến số (x, n, P); từ hai chữ trở lên là chữ.
  const inWord = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; ) {
    if (!isLetter(glyphs[i]!.ch) || glyphs[i]!.anchor) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && isLetter(glyphs[j]!.ch) && !glyphs[j]!.anchor) j += 1;
    if (j - i >= 2 || !isLatinLetter(glyphs[i]!.ch)) {
      for (let k = i; k < j; k += 1) inWord[k] = true;
    }
    i = j;
  }

  const kind = glyphs.map((g, i) => {
    if (g.anchor || g.sup) return "math" as const;
    if (g.ch === " ") return "space" as const;
    if (inWord[i]) return "text" as const;
    if (isDigit(g.ch) || isLatinLetter(g.ch) || MATH_PUNCT.has(g.ch)) return "math" as const;
    return "text" as const;
  });

  // 2. Đoạn liền nhau gồm toàn math/space, và phải có ít nhất một MỐC.
  /** Chữ ngoài công thức: số mũ vẫn phải là ký tự mũ, `x2` không đọc được. */
  const plain = (gs: Glyph[]) =>
    gs.map((g) => (g.sup ? SUPERSCRIPT_DIGITS[g.ch] ?? `^${g.ch}` : g.ch)).join("");

  const out: string[] = [];
  let i = 0;
  while (i < n) {
    if (kind[i] === "text") {
      out.push(plain([glyphs[i]!]));
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && kind[j] !== "text") j += 1;
    let from = i;
    let to = j;
    while (from < to && kind[from] === "space") from += 1;
    while (to > from && kind[to - 1] === "space") to -= 1;
    const hasAnchor = glyphs.slice(from, to).some((g) => g.anchor);
    // Một ký tự lẻ thì để nguyên: `$x$` giữa câu không giúp gì mà rối mắt.
    if (hasAnchor && to - from >= 2) {
      out.push(plain(glyphs.slice(i, from)));
      const tex = glyphsToLatex(glyphs.slice(from, to));
      out.push(tex ? `$${tex}$` : plain(glyphs.slice(from, to)));
      out.push(plain(glyphs.slice(to, j)));
    } else {
      out.push(plain(glyphs.slice(i, j)));
    }
    i = j;
  }
  return out.join("");
}

/** Các ký tự của một đoạn công thức → LaTeX. Rỗng nghĩa là không chuyển được. */
function glyphsToLatex(glyphs: Glyph[]): string {
  let out = "";
  let sup = "";
  const flush = () => {
    if (sup) out += `^{${sup}}`;
    sup = "";
  };
  try {
    for (const g of glyphs) {
      const tex = unicodeToLatex(g.ch);
      if (g.sup) sup += tex.trim();
      else {
        flush();
        out += tex;
      }
    }
  } catch {
    return ""; // gặp ký tự chưa biết → giữ nguyên chữ
  }
  flush();
  return out.replace(/\s+/g, " ").trim();
}

function renderLine(
  line: PdfTextItem[],
  fonts: Map<string, SymbolFont>,
  rules: PdfRule[],
): string {
  const body = bodySize(line);
  const baseline = line.find((it) => Math.round(it.size * 2) / 2 === body)?.y ?? line[0]!.y;

  const glyphs: Glyph[] = [];
  const push = (text: string, anchor: boolean, sup: boolean) => {
    for (const ch of text) glyphs.push({ ch, anchor, sup });
  };
  let prevEnd: number | null = null;

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
    const isSup = it.size < 0.85 * body && it.y > baseline + 0.1 * body;
    const last = glyphs[glyphs.length - 1]?.ch;
    if (spaced && !/^\s/.test(text) && last && !/\s/.test(last)) {
      push(wideGap ? "\t" : " ", false, false);
    }
    // Ký hiệu toán đến từ font Symbol / MT Extra — đó là MỐC của công thức.
    const fromMathFont = fonts.has(it.fontKey);
    // Gạch chân = đáp án đúng. Bọc bằng đúng mốc mà đường Word dùng, để
    // parser nhận ra bằng một luật chung chứ không phải hai luật song song.
    const underlined = rules.some((r) => isUnderlineOf(r, it, text));
    if (underlined) push(U_OPEN, false, false);
    push(text, fromMathFont, isSup);
    if (underlined) push(U_CLOSE, false, false);
    prevEnd = it.x + it.width;
  }

  return wrapMathSpans(glyphs).replace(/ {2,}/g, " ").trimEnd();
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
    // Hình ĐÈ LÊN chữ của dòng đó là hình thả nổi (Word neo nó cạnh đoạn
    // văn), không phải hình nằm trong dòng. Chèn vào giữa thì nó cắt đôi câu
    // — hình Venn của câu cuối rơi đúng vào giữa `n(X)=35, n(A)=20`. Cho nó
    // đứng riêng một dòng ngay dưới.
    // Chồng ĐÁNG KỂ, không phải chạm mép: nhãn "A." thường thừa ra vài điểm
    // vào chỗ hình, chấp nhận được; còn cả một dòng công thức nằm vắt qua
    // hình thì mới là hình thả nổi.
    const overlapWith = (it: PdfTextItem) =>
      Math.min(it.x + it.width, img.x + img.width) - Math.max(it.x, img.x);
    const overlapsText =
      best >= 0 &&
      out[best]!.some(
        (it) =>
          // Mẩu KHOẢNG TRẮNG không phải chữ: Word hay đặt một dấu cách rộng
          // ngay chỗ hình, tính vào là hình nào cũng thành "thả nổi".
          it.str.trim() !== "" &&
          overlapWith(it) > 0.25 * Math.min(it.width, img.width),
      );
    if (best >= 0 && !overlapsText) out[best]!.push(item);
    else if (best >= 0) out.splice(best + 1, 0, [{ ...item, y: out[best]![0]!.y - 0.01 }]);
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
  return attachImages(mergeBraceSystems(groupLines(usable), fonts), images)
    .map((line) => renderLine(line, fonts, rules))
    .filter((l) => l.trim())
    .join("\n");
}
