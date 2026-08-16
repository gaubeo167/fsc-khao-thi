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

/**
 * Rút chữ từ PDF, giữ nguyên cách xuống dòng.
 *
 * Xuống dòng là thứ parser dựa vào để cắt câu (`Câu 1.` đứng đầu dòng) và
 * để tách phương án, nên KHÔNG gộp dòng ở đây.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  // Nạp động: `unpdf` kéo theo pdfjs khá nặng, mà phần lớn lần nhập đề là
  // file Word — không việc gì bắt mọi lần gọi route phải trả giá đó.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return normalisePdfText(text);
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
    .map((l) => l.replace(/[ \t ]+/g, " ").trim());

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
