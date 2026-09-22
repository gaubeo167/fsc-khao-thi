/**
 * HTML do mammoth sinh ra → văn bản phẳng mà parser FSC đọc được.
 *
 * Tách khỏi route để hai cửa vào (`/api/import/parse` cũ và
 * `/api/import/parse-questions` mới) dùng chung đúng MỘT bản. Nhân đôi hàm
 * này là cách chắc chắn để hai đường nhập cùng một file lại ra hai kết quả
 * khác nhau sau vài lần sửa.
 */

const IMG_RE = /<img\b[^>]*?src="([^"]+)"[^>]*?(?:alt="([^"]*)")?[^>]*?\/?>/gi;

/**
 * `<img>` → markdown `![](src)`, dùng chung cho cả hai bộ bẻ phẳng HTML.
 *
 * Ảnh nằm CÙNG ĐOẠN với chữ thì giữ trong dòng; ảnh đứng riêng mới xuống
 * dòng. Bản cũ xuống dòng cho mọi ảnh, nên một phương án như
 * `<p>B. <img> là số chẵn.</p>` vỡ thành ba dòng: nhãn "B." còn lại một mình
 * nên phương án rỗng, còn "là số chẵn." rơi xuống thành đề bài. Đề Toán nào
 * có công thức hay hình chèn giữa các phương án đều mất đáp án như vậy.
 *
 * Ngược lại, ảnh đứng RIÊNG một đoạn phải giữ dòng riêng: Word neo công thức
 * thả nổi ra ngoài `<p>`, gộp vào là dòng "Câu 6" không còn đứng đầu dòng và
 * parser mất hẳn câu đó.
 */
export function imagesToMarkdown(
  html: string,
  render: (src: string, alt?: string) => string,
): string {
  const inlined = html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (block) => {
    if (!/<img\b/i.test(block)) return block;
    const text = block.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!text) return block; // đoạn chỉ có ảnh → để vòng dưới xuống dòng
    return block.replace(IMG_RE, (_m, src, alt) => render(src, alt));
  });
  return inlined.replace(IMG_RE, (_m, src, alt) => `\n${render(src, alt)}\n`);
}

/**
 * Flatten a mammoth-produced HTML string into the FSC import text
 * format:
 *   - `<h1>...</h1>` / `<h2>` → preserved as their own line
 *   - `<p>...</p>` → one line of text per paragraph
 *   - `<br>` → newline
 *   - `<img src="data:...">` → `![](data:...)` markdown
 *   - `<strong>X</strong>` → `**X**`
 *   - `<em>X</em>` → `*X*`
 *   - all other tags stripped
 *
 * Whitespace is normalised so empty paragraphs separate blocks the same
 * way they do in the user's Word file.
 */
export function htmlToFscText(html: string): string {
  let out = html;

  // <img> → markdown image (preserve alt + src). dataUri-style src is
  // long but the parser only treats it as opaque content.
  out = imagesToMarkdown(out, (src, alt) => `![${alt ?? ""}](${src})`);

  // Bold / italic. mammoth wraps both meta-key labels AND incidental
  // emphasis in <strong>; the FSC parser is key/value-based and
  // doesn't care about formatting hints, so we drop the tags rather
  // than translate to markdown markers. Otherwise lines like
  // `<p><strong>Dạng: </strong>MCQ-SINGLE</p>` would arrive as
  // `**Dạng: **MCQ-SINGLE`, breaking the `key:` regex.
  out = out.replace(/<\/?strong\b[^>]*>/gi, "");
  out = out.replace(/<\/?b\b[^>]*>/gi, "");
  out = out.replace(/<\/?em\b[^>]*>/gi, "");
  out = out.replace(/<\/?i\b[^>]*>/gi, "");

  // Headings + paragraphs → newline boundaries. Strip the tags but
  // keep their text content with a leading/trailing newline so block
  // structure survives.
  out = out.replace(/<\/?h[1-6]\b[^>]*>/gi, "\n");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/p>/gi, "\n");
  out = out.replace(/<p\b[^>]*>/gi, "");

  // Lists — turn <li> into its own line.
  out = out.replace(/<\/?ul\b[^>]*>/gi, "\n");
  out = out.replace(/<\/?ol\b[^>]*>/gi, "\n");
  out = out.replace(/<li\b[^>]*>/gi, "");
  out = out.replace(/<\/li>/gi, "\n");

  // Table → flatten rows as lines (rare in question files but possible).
  out = out.replace(/<\/?table\b[^>]*>/gi, "\n");
  out = out.replace(/<\/?tbody\b[^>]*>/gi, "");
  out = out.replace(/<\/?thead\b[^>]*>/gi, "");
  out = out.replace(/<tr\b[^>]*>/gi, "");
  out = out.replace(/<\/tr>/gi, "\n");
  out = out.replace(/<td\b[^>]*>/gi, " ");
  out = out.replace(/<\/td>/gi, " ");
  out = out.replace(/<th\b[^>]*>/gi, " ");
  out = out.replace(/<\/th>/gi, " ");

  // Drop anything else.
  out = out.replace(/<[^>]+>/g, "");

  // Decode common entities.
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Collapse 3+ blank lines, trim each line's right whitespace.
  out = out
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
