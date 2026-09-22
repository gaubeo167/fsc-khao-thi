/**
 * Thay công thức / ảnh nhúng trong `word/document.xml` TRƯỚC khi mammoth đọc.
 *
 * ── Vì sao phải đụng vào file Word chứ không xử lý ở HTML ───────────────────
 *
 * mammoth KHÔNG đọc được VML (`<w:object>`, `<w:pict>` — khuôn mà MathType và
 * ảnh dán trong Word dùng). Nó nhấc chúng ra NGOÀI đoạn văn và đổ thành một
 * chuỗi ảnh đứng trước đoạn. Hậu quả trên đề thật:
 *
 *     <p>Câu 6 … Khi đó  là tập nào sau đây?</p>
 *     ⟦ảnh⟧⟦ảnh⟧<p>A.  B.  C.  D. </p>   ← bốn phương án RỖNG
 *     ⟦ảnh⟧⟦ảnh⟧⟦ảnh⟧⟦ảnh⟧<p>Câu 7 …
 *
 * Bốn công thức của phương án nằm lạc ra ngoài, dòng `A. B. C. D.` trống trơn
 * nên parser báo "Cần ít nhất 2 phương án" — đúng lỗi giáo viên gặp. Vị trí
 * thật CÓ trong file Word, chỉ mất khi qua mammoth; nên phải thay ngay trong
 * XML, tại đúng chỗ nó đứng.
 *
 * Mỗi đối tượng được thay bằng MỘT trong hai thứ:
 *
 *   · `$LaTeX$` — khi đọc được cấu trúc công thức (xem `mtef-to-latex.ts`).
 *     Giáo viên bấm vào sửa được, và đề xuất Word / in ra đều dùng lại được.
 *   · một mốc chữ `⟦FSCMATH-n⟧` — đổi thành ảnh SVG sau khi mammoth chạy xong.
 *     Dùng cho ảnh dán thường và cho công thức mà bộ đọc chưa dám chắc.
 *
 * Cả hai đều là CHỮ nằm đúng vị trí, nên dòng phương án không còn rỗng nữa.
 */

import type JSZip from "jszip";

import { oleToLatex } from "./mtef-to-latex";
import { wmfToSvgDataUri } from "./wmf-to-svg";

/** Mốc tạm trong văn bản. Dùng ký tự ngoặc vuông trắng để không đụng nội dung đề. */
const marker = (k: number) => `⟦FSCMATH-${k}⟧`;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
};

export interface InlineMathResult {
  docXml: string;
  /** mốc → data URI, thay vào HTML sau khi mammoth chạy. */
  images: Record<string, string>;
  /** Số công thức ra được LaTeX sửa tay được. */
  latexCount: number;
  /** Số đối tượng phải quay về dùng ảnh. */
  imageCount: number;
  /** Số đối tượng không đọc được gì (bị bỏ hẳn). */
  droppedCount: number;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** rId → đường dẫn trong gói (vd `rId7` → `word/media/image3.wmf`). */
function readRels(relsXml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) {
    const target = m[2]!.replace(/^\/?word\//, "").replace(/^\.\//, "");
    out[m[1]!] = `word/${target}`;
  }
  return out;
}

async function bytesOf(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return await file.async("uint8array");
  } catch {
    return null;
  }
}

/** Ảnh bất kỳ trong gói → data URI hiển thị được (WMF/EMF dựng lại thành SVG). */
async function imageDataUri(zip: JSZip, path: string): Promise<string | null> {
  const bytes = await bytesOf(zip, path);
  if (!bytes) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "wmf" || ext === "emf") return wmfToSvgDataUri(bytes);
  const mime = MIME[ext];
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

const rIdOf = (xml: string, tag: string): string | null =>
  new RegExp(`<${tag}\\b[^>]*r:id="([^"]+)"`).exec(xml)?.[1] ?? null;

/**
 * Thay mọi `<w:object>` (công thức MathType) và `<w:pict>` có ảnh (ảnh dán)
 * bằng LaTeX hoặc mốc ảnh, ngay tại vị trí chúng đứng trong văn bản.
 *
 * `<w:pict>` chỉ chứa hình vẽ (`v:line`, `v:rect`, khung trang trí) không có
 * `v:imagedata` thì để nguyên — mammoth vốn đã bỏ qua chúng.
 */
export async function inlineMathTypeObjects(
  zip: JSZip,
  docXml: string,
): Promise<InlineMathResult> {
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const rels = relsFile ? readRels(await relsFile.async("string")) : {};
  const images: Record<string, string> = {};
  let latexCount = 0;
  let imageCount = 0;
  let droppedCount = 0;
  let key = 0;

  // Hai lượt: gom các đoạn cần thay (đọc file trong gói là bất đồng bộ nên
  // không dùng được trong callback của String.replace), rồi ghép lại một lần.
  const targets: Array<{ start: number; end: number; xml: string }> = [];
  for (const re of [/<w:object\b[\s\S]*?<\/w:object>/g, /<w:pict\b[\s\S]*?<\/w:pict>/g]) {
    for (const m of docXml.matchAll(re)) {
      const start = m.index ?? 0;
      // `<w:pict>` nằm trong `<w:object>` đã được lượt trước nhận rồi.
      if (targets.some((t) => start >= t.start && start < t.end)) continue;
      targets.push({ start, end: start + m[0].length, xml: m[0] });
    }
  }
  targets.sort((a, b) => a.start - b.start);

  const pieces: string[] = [];
  let cursor = 0;
  for (const t of targets) {
    const oleId = rIdOf(t.xml, "o:OLEObject");
    const imgId = rIdOf(t.xml, "v:imagedata");
    let replacement: string | null = null;

    if (oleId && rels[oleId]) {
      const bin = await bytesOf(zip, rels[oleId]!);
      const tex = bin ? oleToLatex(bin) : null;
      if (tex) {
        replacement = `<w:t xml:space="preserve">$${escapeXml(tex)}$</w:t>`;
        latexCount += 1;
      }
    }
    if (replacement === null && imgId && rels[imgId]) {
      const uri = await imageDataUri(zip, rels[imgId]!);
      if (uri) {
        const mk = marker(key++);
        images[mk] = uri;
        replacement = `<w:t xml:space="preserve">${mk}</w:t>`;
        imageCount += 1;
      }
    }
    if (replacement === null) {
      // Không có ảnh lẫn công thức đọc được: `<w:pict>` trang trí thì để yên,
      // còn `<w:object>` hỏng thì bỏ (mammoth cũng bỏ).
      if (!imgId) continue;
      droppedCount += 1;
      replacement = "";
    }
    pieces.push(docXml.slice(cursor, t.start), replacement);
    cursor = t.end;
  }
  pieces.push(docXml.slice(cursor));

  return { docXml: pieces.join(""), images, latexCount, imageCount, droppedCount };
}

/** Đổi mốc trong HTML của mammoth thành thẻ ảnh. */
export function applyMathImages(html: string, images: Record<string, string>): string {
  let out = html;
  for (const [mk, uri] of Object.entries(images)) {
    out = out.split(mk).join(`<img src="${uri}" />`);
  }
  return out;
}
