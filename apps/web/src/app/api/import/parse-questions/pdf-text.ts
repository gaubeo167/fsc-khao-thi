/**
 * PDF → văn bản phẳng cho đường nhập đề.
 *
 * ── PDF khác Word ở hai điểm quyết định ─────────────────────────────────
 *
 * 1. KHÔNG có gạch chân đọc lại được. Word lưu gạch chân thành thuộc tính
 *    của đoạn chữ; PDF chỉ lưu nét vẽ ở toạ độ nào đó, không gắn với chữ
 *    nào cả. Nên đề PDF luôn ra "chưa đánh dấu đáp án đúng" và người soạn
 *    phải chọn tay. Đây là hạn chế của định dạng, không phải lỗi — nói
 *    thẳng ra còn hơn để họ tưởng hệ thống đọc sót.
 *
 * 2. Có loại PDF KHÔNG CHỨA CHỮ NÀO: bản scan, mỗi trang là một tấm ảnh.
 *    Đưa vào parser thì ra 0 câu, và thông báo "không nhận ra cấu trúc câu
 *    hỏi" hoàn toàn sai địa chỉ — file không có cấu trúc gì để nhận, nó
 *    không có chữ. `looksScanned` tách riêng ca này để báo đúng bệnh.
 */

import { extractPdfImages } from "./pdf-images";
import { layoutPdfPage, type PdfRule, type PdfTextItem } from "./pdf-layout";

/**
 * pdf.js gọi `ArrayBuffer.prototype.transferToFixedLength` khi dựng danh sách
 * lệnh vẽ. Node 22 trở lên mới có; Node 20 thì lệnh vẽ hỏng IM LẶNG — trả về
 * gần như rỗng, nên mất hết gạch chân (tức mất đáp án đúng của đề PDF). Vá
 * đúng một hàm, chỉ khi thiếu.
 */
function ensureArrayBufferTransfer(): void {
  const proto = ArrayBuffer.prototype as ArrayBuffer & {
    transferToFixedLength?: (len?: number) => ArrayBuffer;
  };
  if (typeof proto.transferToFixedLength === "function") return;
  Object.defineProperty(proto, "transferToFixedLength", {
    value(this: ArrayBuffer, len?: number) {
      const size = len ?? this.byteLength;
      const out = new ArrayBuffer(size);
      new Uint8Array(out).set(
        new Uint8Array(this, 0, Math.min(size, this.byteLength)),
      );
      return out;
    },
    configurable: true,
    writable: true,
  });
}

/**
 * Nét ngang mảnh trên trang — ứng viên gạch chân (đáp án đúng).
 *
 * `constructPath` của pdf.js mang theo khung bao [minX, minY, maxX, maxY];
 * chỉ cần khung đó là đủ để biết nét nằm đâu, không phải dựng lại đường vẽ.
 */
async function pageRules(page: {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}, constructPathOp: number): Promise<PdfRule[]> {
  const out: PdfRule[] = [];
  try {
    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] !== constructPathOp) continue;
      const box = (ops.argsArray[i] as unknown[])?.[2] as
        | Record<number, number>
        | undefined;
      if (!box) continue;
      const [x0, y0, x1, y1] = [box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0];
      const w = x1 - x0;
      const h = y1 - y0;
      // Mảnh và nằm ngang. Đường kẻ bảng cũng lọt vào đây, nhưng bước khớp
      // với chân chữ ở `pdf-layout.ts` loại chúng ra.
      if (h <= 2 && w >= 4) out.push({ x0, x1, y: (y0 + y1) / 2 });
    }
  } catch {
    // Không đọc được lệnh vẽ thì mất gạch chân, không làm hỏng cả lần nhập.
  }
  return out;
}

/**
 * Rút chữ từ PDF, giữ nguyên cách xuống dòng.
 *
 * Xuống dòng là thứ parser dựa vào để cắt câu (`Câu 1.` đứng đầu dòng) và
 * để tách phương án, nên KHÔNG gộp dòng ở đây.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  // Nạp động: `unpdf` kéo theo pdfjs khá nặng, mà phần lớn lần nhập đề là
  // file Word — không việc gì bắt mọi lần gọi route phải trả giá đó.
  ensureArrayBufferTransfer();
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages: string[] = [];
  const imageUris: Record<string, string> = {};
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of content.items) {
      // `getTextContent` trộn cả mốc đánh dấu; chỉ mẩu chữ mới có `transform`.
      const it = raw as {
        str?: string;
        width?: number;
        transform?: number[];
        fontName?: string;
      };
      if (typeof it.str !== "string" || !it.transform) continue;
      items.push({
        str: it.str,
        x: it.transform[4] ?? 0,
        y: it.transform[5] ?? 0,
        // transform[0] là cỡ chữ sau khi nhân ma trận; |transform[3]| khi chữ
        // bị lật. Lấy cái nào khác 0 để không ra cỡ 0 rồi chia cho 0.
        size: Math.abs(it.transform[0] || it.transform[3] || 0) || 12,
        width: it.width ?? 0,
        fontKey: it.fontName ?? "",
      });
    }
    // Ảnh: phương án của dạng câu "Hình vẽ nào sau đây…" chính là hình, nên
    // thiếu chúng là câu đó rỗng. Cắm mốc vào đúng dòng rồi thay bằng thẻ ảnh.
    const images = await extractPdfImages(
      page as never,
      {
        save: OPS.save,
        restore: OPS.restore,
        transform: OPS.transform,
        paintImageXObject: OPS.paintImageXObject,
        paintInlineImageXObject: OPS.paintInlineImageXObject,
      },
      String(p),
    );
    for (const img of images) imageUris[img.marker] = img.dataUri;
    pages.push(
      layoutPdfPage(items, await pageRules(page, OPS.constructPath), images),
    );
  }
  // Thay mốc bằng thẻ ảnh SAU khi dọn dẹp, để bước gộp khoảng trắng không
  // đụng vào chuỗi base64 dài hàng chục nghìn ký tự.
  let text = normalisePdfText(pages.join("\n"));
  for (const [marker, uri] of Object.entries(imageUris)) {
    text = text.split(marker).join(`![](${uri})`);
  }
  return text;
}

/**
 * Dọn văn bản PDF cho giống văn bản Word.
 *
 * Ba việc, mỗi việc chữa một tật riêng của PDF:
 *
 *   · Bỏ gạch nối cuối dòng ("nhiễm sắc-\nthể" → "nhiễm sắcthể" là sai, nên
 *     chỉ nối khi đúng là ngắt từ giữa dòng).
 *   · Bỏ dòng đánh số trang ("Trang 1/3", "Mã đề 0401") — chúng nằm giữa
 *     các câu và sẽ bị tính vào đề bài của câu liền trên.
 *   · Gộp khoảng trắng thừa trong dòng, giữ nguyên số dòng.
 */
export function normalisePdfText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    // Từ bị ngắt bởi gạch nối cuối dòng — nối lại.
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .split("\n")
    // Gộp dấu cách thừa nhưng GIỮ TAB: `pdf-layout` dùng tab để đánh dấu hai
    // phương án nằm hai cột trên cùng một dòng; gộp mất tab là bốn phương án
    // thành ba.
    .map((l) => l.replace(/[ \u00a0\u2000-\u200a]+/g, " ").trim());

  const out: string[] = [];
  for (const line of lines) {
    if (PAGE_FURNITURE_RE.test(line)) continue;
    out.push(line);
  }
  // Gộp 3 dòng trống trở lên thành một, giống htmlToFscText.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Dòng "đồ trang trí" của trang in: số trang, mã đề, dấu hết đề.
 *
 * Cố ý HẸP. Bắt rộng tay ở đây là ăn mất nội dung đề, mà mất chữ trong đề
 * thì không ai soát lại được — thà để sót một dòng "Trang 1/3" cho người
 * soạn tự xoá.
 */
const PAGE_FURNITURE_RE =
  /^(?:Trang\s*\d+\s*[/\-]\s*\d+|Mã đề\s*\d+(?:\s+Trang\s*\d+\s*\/\s*\d+)?|-+\s*HẾT\s*-+|\d+\s*\/\s*\d+)$/iu;

/**
 * PDF có phải bản scan (không chứa chữ) hay không.
 *
 * Đo bằng SỐ CHỮ, không đo bằng "có text hay không": bản scan vẫn hay kèm
 * dăm ba ký tự rác từ lớp metadata, nên kiểm tra rỗng thì lọt.
 */
export function looksScanned(text: string): boolean {
  return text.replace(/\s+/g, "").length < 200;
}
