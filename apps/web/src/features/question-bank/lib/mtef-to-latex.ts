/**
 * Công thức MathType nhúng trong .docx → LaTeX thật (sửa được), không phải ảnh.
 *
 * Mỗi công thức MathType trong file Word là một đối tượng OLE. Bên trong nó có
 * luồng `Equation Native` chứa MTEF — định dạng riêng của MathType, mô tả CẤU
 * TRÚC công thức (ký tự, số mũ, ngoặc, hệ phương trình), chứ không phải ảnh.
 * Đọc được MTEF thì giáo viên nhận về `$x^{2}+1\ge 2x$` bấm vào sửa được, thay
 * vì một tấm ảnh chết.
 *
 * ── Ba chỗ dễ sai, đều đã vấp ───────────────────────────────────────────────
 *
 *  1. **File .bin là compound file OLE, dữ liệu nằm rải theo sector.** Cắt thô
 *     từ chữ ký `EQNOLEFILEHDR` là mất đuôi công thức: `∀n∈ℕ,n(n+1)` cụt còn
 *     `∀n∈ℕ,n`. Phải đọc đúng luồng qua `XLSX.CFB` (gói đã có sẵn cho Excel).
 *  2. **`mtcode` của bản ghi CHAR dài 2 byte**, không phải 1. Đọc 1 byte là
 *     lệch cả dòng và mọi ký tự sau đó thành rác.
 *  3. **Đuôi luồng có rác đệm.** Gặp bản ghi lạ thì DỪNG và giữ phần đã đọc,
 *     nhưng đánh dấu `truncated` — đọc thiếu thì KHÔNG dùng LaTeX.
 *
 * ── Nguyên tắc: không đoán ──────────────────────────────────────────────────
 *
 * Đây là đề thi. Một công thức sai lặng lẽ tệ hơn một tấm ảnh. Nên hàm này chỉ
 * trả về LaTeX khi CHẮC: đọc trọn luồng, mọi template đều nằm trong danh sách
 * đã đối chiếu bằng mắt với bản dựng của LibreOffice, không gặp mã ký tự lạ.
 * Còn lại trả `null`, và chỗ gọi quay về dùng ảnh (xem `wmf-to-svg.ts`).
 */

import * as XLSX from "xlsx";

/* ────────────────────────── bảng ký tự ────────────────────────── */

/**
 * Chữ Hy Lạp hoa TRÙNG HÌNH với chữ Latin. MathType lưu "tam giác ABC" bằng
 * phím A/B/C trong font Symbol, ra Α/Β/Χ — nhìn y hệt nhưng tìm kiếm và sao
 * chép thì hỏng. Chỉ đổi những chữ trùng hình; Δ, Ω, Φ… khác hình, giữ nguyên.
 */
const GREEK_LOOKALIKE: Record<string, string> = {
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K",
  Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

const CMD: Record<string, string> = {
  "∀": "\\forall", "∃": "\\exists", "∄": "\\nexists", "∈": "\\in", "∉": "\\notin",
  "∅": "\\emptyset", "∪": "\\cup", "∩": "\\cap", "⊂": "\\subset", "⊄": "\\not\\subset",
  "⊆": "\\subseteq", "⊃": "\\supset", "⊇": "\\supseteq", "∖": "\\setminus",
  "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}",
  "≥": "\\ge", "≤": "\\le", "≠": "\\ne", "≈": "\\approx", "≡": "\\equiv", "∼": "\\sim",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow", "→": "\\to", "←": "\\gets",
  "∞": "\\infty", "−": "-", "×": "\\times", "÷": "\\div", "±": "\\pm", "∓": "\\mp",
  "⋅": "\\cdot", "∘": "\\circ", "°": "^{\\circ}", "∠": "\\angle", "△": "\\triangle",
  "∥": "\\parallel", "⊥": "\\perp", "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "√": "\\sqrt",
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\varepsilon",
  "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "π": "\\pi", "ρ": "\\rho", "σ": "\\sigma",
  "τ": "\\tau", "φ": "\\varphi", "ω": "\\omega",
  "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda", "Σ": "\\Sigma",
  "Φ": "\\Phi", "Ψ": "\\Psi", "Ω": "\\Omega",
};

/** Ký tự có nghĩa riêng trong LaTeX — phải thoát, nếu không KaTeX vỡ. */
const ESC: Record<string, string> = {
  "%": "\\%", $: "\\$", "&": "\\&", "#": "\\#", _: "\\_", "{": "\\{", "}": "\\}", "^": "\\^{}",
};

const FENCE: Record<string, string> = {
  "(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}",
  "|": "|", "⟨": "\\langle", "⟩": "\\rangle",
};

/**
 * Mã trong vùng ký tự riêng của MathType mà bản dựng KHÔNG vẽ ra gì (dấu nhân
 * ngầm, mốc hàm số). Đối chiếu với ảnh WMF của chính đề K10 mới dám bỏ.
 */
const PUA_INVISIBLE = new Set([0xef02]);

/* ────────────────────────── bản ghi MTEF ────────────────────────── */

const END = 0, LINE = 1, CHAR = 2, TMPL = 3, PILE = 4, MATRIX = 5, EMBELL = 6,
  RULER = 7, FONT_STYLE_DEF = 8, SIZE = 9, FULL = 10, SUB = 11, SUB2 = 12,
  SYM = 13, SUBSYM = 14, COLOR = 15, COLOR_DEF = 16, FONT_DEF = 17,
  EQN_PREFS = 18, ENCODING_DEF = 19;

const OPT_NUDGE = 0x08, OPT_CHAR_EMBELL = 0x01, OPT_CHAR_ENC_CHAR8 = 0x04,
  OPT_CHAR_ENC_CHAR16 = 0x10, OPT_CHAR_ENC_NO_MTCODE = 0x20,
  OPT_LINE_NULL = 0x01, OPT_LP_RULER = 0x02, OPT_LINE_LSPACE = 0x04;

/** Template đã đối chiếu bằng mắt trên đề thật. Gặp cái khác → trả ảnh. */
const T_BRACE = 2;    // hệ phương trình: dấu { trái + nhiều dòng xếp chồng
const T_OVERBAR = 13; // P̄ — phủ định của mệnh đề
const T_SUBSUP = 28;  // ô 1 = chỉ số dưới, ô 2 = số mũ

type Node =
  | { k: "char"; mt: number }
  | { k: "line"; kids: Node[] }
  | { k: "pile"; kids: Node[] }
  | { k: "tmpl"; sel: number; variation: number; kids: Node[] }
  | { k: "matrix" };

class MtefReader {
  private o = 0;
  truncated = false;
  constructor(private readonly d: Uint8Array) {}

  private b(): number {
    if (this.o >= this.d.length) throw new Error("hết dữ liệu");
    return this.d[this.o++]!;
  }
  private w(): number {
    const lo = this.b();
    return lo | (this.b() << 8);
  }
  private str(): string {
    let s = "";
    for (;;) {
      const c = this.b();
      if (!c) return s;
      s += String.fromCharCode(c);
    }
  }
  private nudge(opt: number): void {
    if (!(opt & OPT_NUDGE)) return;
    const dx = this.b();
    const dy = this.b();
    if (dx === 128 || dy === 128) {
      this.w();
      this.w();
    }
  }
  private ruler(): void {
    const n = this.b();
    for (let i = 0; i < n; i++) {
      this.b();
      this.w();
    }
  }
  /** Mảng kích thước mã hoá theo nibble, mỗi giá trị kết thúc bằng nibble 0xF. */
  private dims(count: number): void {
    let done = 0;
    while (done < count) {
      const c = this.b();
      if ((c & 0x0f) === 0x0f) done++;
      if ((c & 0xf0) === 0xf0) done++;
    }
  }
  private prefs(): void {
    this.b();
    this.dims(this.b());
    this.dims(this.b());
    const styles = this.b();
    for (let i = 0; i < styles; i++) {
      const c = this.b();
      if (c) this.b();
    }
  }
  private embellishments(): void {
    for (;;) {
      const t = this.b();
      if (t === END) return;
      if (t !== EMBELL) {
        this.o--;
        return;
      }
      const opt = this.b();
      this.nudge(opt);
      this.b();
    }
  }

  private list(): Node[] {
    const out: Node[] = [];
    for (;;) {
      if (this.o >= this.d.length) return out;
      const t = this.b();
      switch (t) {
        case END:
          return out;
        case LINE: {
          const opt = this.b();
          this.nudge(opt);
          if (opt & OPT_LINE_LSPACE) this.b();
          if (opt & OPT_LP_RULER) this.ruler();
          out.push({ k: "line", kids: opt & OPT_LINE_NULL ? [] : this.list() });
          break;
        }
        case CHAR: {
          const opt = this.b();
          this.nudge(opt);
          this.b(); // typeface
          let mt = 0;
          if (!(opt & OPT_CHAR_ENC_NO_MTCODE)) mt = this.w(); // 2 BYTE
          if (opt & OPT_CHAR_ENC_CHAR8) this.b();
          if (opt & OPT_CHAR_ENC_CHAR16) this.w();
          if (opt & OPT_CHAR_EMBELL) this.embellishments();
          out.push({ k: "char", mt });
          break;
        }
        case TMPL: {
          const opt = this.b();
          this.nudge(opt);
          const sel = this.b();
          const v = this.b();
          const variation = v & 0x80 ? (v & 0x7f) | (this.b() << 7) : v;
          this.b(); // options của template
          out.push({ k: "tmpl", sel, variation, kids: this.list() });
          break;
        }
        case PILE: {
          const opt = this.b();
          this.nudge(opt);
          this.b();
          this.b();
          if (opt & OPT_LP_RULER) this.ruler();
          out.push({ k: "pile", kids: this.list() });
          break;
        }
        case MATRIX:
          // Ma trận: bố cục phức tạp, chưa đối chiếu được → coi như không đọc nổi.
          out.push({ k: "matrix" });
          this.truncated = true;
          return out;
        case EMBELL: {
          const opt = this.b();
          this.nudge(opt);
          this.b();
          break;
        }
        case RULER:
          this.ruler();
          break;
        case FONT_STYLE_DEF:
          this.b();
          this.b();
          break;
        case FONT_DEF:
          this.b();
          this.str();
          break;
        case SIZE:
          this.b();
          this.b();
          break;
        case FULL:
        case SUB:
        case SUB2:
        case SYM:
        case SUBSYM:
          break;
        case COLOR:
          this.b();
          break;
        case COLOR_DEF: {
          const opt = this.b();
          const n = opt & 1 ? 4 : 3;
          for (let i = 0; i < n; i++) this.w();
          if (opt & 4) this.str();
          break;
        }
        case EQN_PREFS:
          this.prefs();
          break;
        case ENCODING_DEF:
          this.str();
          break;
        default:
          if (t >= 100) {
            this.o += this.b();
            break;
          }
          // Rác đệm ở đuôi khối OLE. Giữ phần đã đọc nhưng đánh dấu đọc thiếu.
          this.truncated = true;
          return out;
      }
    }
  }

  parse(): Node[] {
    for (let i = 0; i < 5; i++) this.b(); // version, platform, product, version, subversion
    this.str(); // khoá ứng dụng, vd "DSMT7"
    this.b(); // tuỳ chọn công thức
    return this.list();
  }
}

/* ────────────────────────── cây → LaTeX ────────────────────────── */

/**
 * Một ký tự Unicode → LaTeX. Dùng chung với bộ đọc ảnh công thức
 * (`wmf-to-svg.ts`) để hai đường ra cùng một kiểu LaTeX.
 *
 * Ném lỗi khi gặp mã trong vùng ký tự riêng mà ta không biết nó vẽ ra gì —
 * chỗ gọi bắt lỗi và quay về dùng ảnh.
 */
export function unicodeToLatex(ch: string): string {
  return charToTex(ch.codePointAt(0) ?? 0);
}

function charToTex(mt: number): string {
  if (PUA_INVISIBLE.has(mt)) return "";
  // Vùng ký tự riêng khác: không biết nó vẽ ra gì, không được đoán.
  if (mt >= 0xe000 && mt <= 0xf8ff) throw new Error(`mã riêng chưa biết U+${mt.toString(16)}`);
  if (mt < 32) return "";
  const raw = String.fromCodePoint(mt);
  const ch = GREEK_LOOKALIKE[raw] ?? raw;
  const cmd = CMD[ch];
  // Dấu cách chỉ cần sau lệnh kết thúc bằng chữ (`\ge 2` chứ không `\ge2`).
  if (cmd) return /[a-zA-Z]$/.test(cmd) ? `${cmd} ` : cmd;
  return ESC[ch] ?? ch;
}

function toTex(nodes: Node[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.k === "char") {
      out += charToTex(n.mt);
      continue;
    }
    if (n.k === "line" || n.k === "pile") {
      out += toTex(n.kids);
      continue;
    }
    if (n.k === "matrix") throw new Error("ma trận");
    if (n.k !== "tmpl") continue;

    const slots = n.kids.filter(
      (k): k is Extract<Node, { k: "line" }> | Extract<Node, { k: "pile" }> =>
        k.k === "line" || k.k === "pile",
    );
    const delims = n.kids
      .filter((k): k is Extract<Node, { k: "char" }> => k.k === "char")
      .map((k) => String.fromCodePoint(k.mt));

    // Ngoặc: MathType lưu chính ký tự ngoặc kèm theo phần thân, nên nhận ra
    // được mà KHÔNG cần biết mã template — đúng cho cả ( ] hỗn hợp của khoảng.
    if (slots.length === 1 && delims.length === 2 && FENCE[delims[0]!] && FENCE[delims[1]!]) {
      out += `\\left${FENCE[delims[0]!]} ${toTex(slots[0]!.kids)}\\right${FENCE[delims[1]!]} `;
      continue;
    }
    // Chỉ số: ô 1 dưới, ô 2 trên. CHỈ xuất số mũ — chiều đó đã đối chiếu trên
    // đề thật (x², AB²). Chưa có mẫu chỉ số DƯỚI nào để kiểm, mà đoán sai thì
    // x₁ thành x¹, nên gặp là trả ảnh.
    if (n.sel === T_SUBSUP && delims.length === 0 && slots.length <= 2) {
      const sub = slots[0] ? toTex(slots[0].kids).trim() : "";
      const sup = slots[1] ? toTex(slots[1].kids).trim() : "";
      if (sub) throw new Error("chỉ số dưới chưa đối chiếu được");
      if (sup) out += `^{${sup}}`;
      continue;
    }
    if (n.sel === T_OVERBAR && slots.length === 1 && delims.length === 0) {
      out += `\\overline{${toTex(slots[0]!.kids).trim()}}`;
      continue;
    }
    if (n.sel === T_BRACE && slots.length === 1 && delims.length === 1 && delims[0] === "{") {
      const rows = slots[0]!.kids
        .filter((k): k is Extract<Node, { k: "line" }> => k.k === "line")
        .map((l) => toTex(l.kids).trim())
        .filter(Boolean);
      if (rows.length >= 2) {
        out += `\\begin{cases}${rows.join(" \\\\ ")}\\end{cases}`;
        continue;
      }
    }
    throw new Error(`template chưa biết sel=${n.sel} var=${n.variation}`);
  }
  return out;
}

/* ────────────────────────── cửa vào ────────────────────────── */

/**
 * Nội dung file `word/embeddings/oleObjectN.bin` → LaTeX, hoặc `null` khi
 * không chắc chắn (chỗ gọi phải quay về dùng ảnh).
 */
export function oleToLatex(bin: Uint8Array): string | null {
  try {
    const cfb = XLSX.CFB.read(bin, { type: "buffer" });
    const entry = XLSX.CFB.find(cfb, "Equation Native");
    const content = entry?.content;
    if (!content) return null;
    const stream = Uint8Array.from(content as ArrayLike<number>);
    if (stream.length < 29) return null;
    // EQNOLEFILEHDR: 28 byte, trong đó cbObject (offset 8) là số byte MTEF thật.
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const cbObject = view.getUint32(8, true);
    const end = cbObject > 0 ? Math.min(28 + cbObject, stream.length) : stream.length;
    const reader = new MtefReader(stream.subarray(28, end));
    const tree = reader.parse();
    const tex = toTex(tree).replace(/\s+/g, " ").trim();
    // Đọc thiếu thì phần cuối công thức đã mất — ảnh còn đúng hơn.
    if (!tex || reader.truncated) return null;
    return tex;
  } catch {
    return null;
  }
}
