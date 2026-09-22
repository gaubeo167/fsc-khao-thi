/**
 * Công thức MathType trong file .docx → SVG hiển thị được.
 *
 * Vì sao cần: đề Toán của trường soạn bằng MathType, tức mỗi công thức là một
 * đối tượng OLE `Equation.DSMT4` kèm ảnh xem trước định dạng WMF — KHÔNG phải
 * công thức Word (`<m:oMath>`). Đường chuyển OMath → `$LaTeX$` vì thế không
 * thấy gì để làm, còn mammoth thì nhét thẳng ảnh WMF vào `<img>`. Trình duyệt
 * không vẽ được WMF, nên giáo viên nhận về một đề đầy biểu tượng ảnh vỡ.
 *
 * Ở đây ta dựng lại ảnh đó thành SVG. Hai chỗ phải tự sửa sau khi dựng:
 *
 *  1. **Bảng mã Symbol.** Bộ dựng giữ nguyên `font-family="Symbol"` cùng mã ký
 *     tự kiểu cũ. Trình duyệt hiện đại tra theo Unicode chứ không theo bảng mã
 *     đó, nên `∀x∈ℝ` hiện ra thành `"x∈¡`. Sai kiểu này NGUY HIỂM HƠN ảnh vỡ:
 *     nhìn lướt vẫn giống một công thức. Ta đổi sang ký tự Unicode thật rồi
 *     thay bằng font toán.
 *  2. **Chữ Hy Lạp trông y hệt chữ Latin.** Trong font Symbol, phím `A` là
 *     Alpha, `B` là Beta… Bộ dựng đổi đúng theo font, nên "tam giác ABC" thành
 *     "tam giác ΑΒΧ" — nhìn không khác gì, nhưng tìm kiếm và sao chép thì hỏng.
 *     Với những chữ mà hình dạng hai bên trùng nhau, ta trả về chữ Latin.
 *
 * Kích thước lấy từ phần đầu "placeable" của chính file WMF (khung bao + số
 * đơn vị trên một inch), nên công thức nằm vừa dòng chữ đúng như trong Word.
 */

import { renderToSvg } from "wmf-emf-renderer";

/** Ảnh mammoth xuất ra cho đối tượng MathType / ảnh vẽ kiểu Windows. */
const METAFILE_SRC_RE =
  /data:image\/(?:x-wmf|wmf|x-emf|emf|x-msmetafile);base64,([A-Za-z0-9+/=]+)/g;

/**
 * Vùng ASCII của font Symbol mà bộ dựng bỏ trống (nó chỉ tra từ mã 161 trở
 * lên và các chữ cái Hy Lạp). Mã nào không có ở đây thì ký tự ASCII trùng
 * luôn với ký hiệu — `(`, `)`, `+`, `=`, `[`, `{`… — nên để nguyên là đúng.
 */
const SYMBOL_ASCII: Record<number, string> = {
  0x22: "∀", // universal
  0x24: "∃", // existential
  0x27: "∍", // suchthat
  0x2a: "∗", // asteriskmath
  0x40: "≅", // congruent
  0x5c: "∴", // therefore
  0x5e: "⊥", // perpendicular
  0x7e: "∼", // similar
};

/**
 * Chữ Hy Lạp hoa trùng hình với chữ Latin. CHỈ những chữ này — Δ, Φ, Ω… khác
 * hình nên phải giữ nguyên, đổi đi là hiện sai hẳn.
 */
const GREEK_LOOKALIKE: Record<string, string> = {
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K",
  Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

/**
 * Font MT Extra của MathType: không có bảng mã công bố. Hai mã dưới đây đối
 * chiếu với bản dựng của LibreOffice trên chính đề K10.TO.TX1 mà ra. Mã lạ để
 * nguyên và đếm vào `unknown` để chỗ gọi cảnh báo người dùng kiểm lại.
 */
const MT_EXTRA: Record<number, string> = {
  0xa1: "ℝ",
  0xa5: "ℕ",
};

const MATH_FONT_STACK =
  "'Cambria Math','STIX Two Math','Times New Roman',serif";

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Khung bao thật của file WMF → cỡ hiển thị tính bằng pt. */
function physicalSizePt(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 22) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x9ac6cdd7) return null; // không có phần đầu placeable
  const left = dv.getInt16(6, true);
  const top = dv.getInt16(8, true);
  const right = dv.getInt16(10, true);
  const bottom = dv.getInt16(12, true);
  const unitsPerInch = dv.getUint16(14, true);
  if (!unitsPerInch) return null;
  const w = ((right - left) / unitsPerInch) * 72;
  const h = ((bottom - top) / unitsPerInch) * 72;
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Đổi ký tự trong các đoạn chữ dùng font Symbol / MT Extra sang Unicode.
 *
 * Tách riêng và xuất ra để `scripts/test-mathtype-docx.mjs` khoá được đúng
 * phép đổi này mà không cần file .docx thật (de-mau/ nằm ngoài repo).
 */
export function fixMetafileGlyphs(svg: string): {
  svg: string;
  unknown: string[];
} {
  const unknown = new Set<string>();
  const out = svg.replace(
    /<text\b([^>]*)>([^<]*)<\/text>/g,
    (whole, attrs: string, body: string) => {
      const family = /font-family="([^"]*)"/.exec(attrs)?.[1] ?? "";
      if (family !== "Symbol" && family !== "MT Extra") return whole;
      const table = family === "Symbol" ? SYMBOL_ASCII : MT_EXTRA;
      const fixed = [...decodeXml(body)]
        .map((ch) => {
          const mapped = table[ch.codePointAt(0) ?? -1];
          if (mapped) return mapped;
          if (family === "Symbol") return GREEK_LOOKALIKE[ch] ?? ch;
          // MT Extra: mã không có trong bảng thì giữ nguyên nhưng ghi lại.
          unknown.add(ch);
          return ch;
        })
        .join("");
      const newAttrs = attrs.replace(
        /font-family="[^"]*"/,
        `font-family="${MATH_FONT_STACK}"`,
      );
      return `<text${newAttrs}>${encodeXml(fixed)}</text>`;
    },
  );
  return { svg: out, unknown: [...unknown] };
}

export interface WmfInlineResult {
  html: string;
  /** Số ảnh metafile đã dựng lại được. */
  converted: number;
  /** Số ảnh dựng hỏng — vẫn để nguyên ảnh cũ, không làm chết lần nhập. */
  failed: number;
  /** Ký tự MT Extra chưa có trong bảng đối chiếu. */
  unknownGlyphs: string[];
}

/**
 * Thay mọi ảnh WMF/EMF nhúng trong HTML bằng SVG dựng lại.
 *
 * Hỏng một ảnh thì giữ nguyên ảnh đó chứ không ném lỗi: mất một công thức
 * còn hơn mất cả lần nhập đề.
 */
export function inlineWmfAsSvg(html: string): WmfInlineResult {
  let converted = 0;
  let failed = 0;
  const unknown = new Set<string>();

  const out = html.replace(METAFILE_SRC_RE, (whole, b64: string) => {
    try {
      const bytes = new Uint8Array(Buffer.from(b64, "base64"));
      const rendered = String(renderToSvg(bytes));
      if (!rendered.includes("<svg")) throw new Error("không dựng được SVG");
      const fixed = fixMetafileGlyphs(rendered);
      for (const ch of fixed.unknown) unknown.add(ch);
      let svg = fixed.svg;
      const size = physicalSizePt(bytes);
      if (size) {
        svg = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
          const withW = attrs.replace(
            /\swidth="[^"]*"/,
            ` width="${round2(size.w)}pt"`,
          );
          return `<svg${withW.replace(
            /\sheight="[^"]*"/,
            ` height="${round2(size.h)}pt"`,
          )}>`;
        });
      }
      converted += 1;
      return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    } catch {
      failed += 1;
      return whole;
    }
  });

  return { html: out, converted, failed, unknownGlyphs: [...unknown] };
}
