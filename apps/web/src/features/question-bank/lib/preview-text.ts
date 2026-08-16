/**
 * Rút gọn nội dung câu hỏi thành DÒNG XEM TRƯỚC cho danh sách.
 *
 * Nội dung câu hỏi lưu dưới dạng văn bản có mốc: `$…$` cho công thức,
 * `[blank:1]` cho ô trống, `[zone:1]` cho vùng thả, `[u:…]` cho cụm gạch
 * chân, `![](data:…)` cho ảnh. Ở ô soạn thảo chúng hiện thành thẻ bấm được;
 * ở danh sách bên trái thì không — nên nếu đưa thẳng chuỗi gốc vào, người
 * soạn đọc đúng cú pháp nội bộ của hệ thống:
 *
 *     Thủ đô của Việt Nam là [blank:1]. Quốc kỳ có [blank:2] ngôi sao vàng.
 *
 * Tệ nhất là ảnh: `![](data:image/png;base64,…)` dài hàng chục nghìn ký tự,
 * đủ để nuốt trọn dòng xem trước và làm chậm cả danh sách.
 *
 * Hàm này đổi mọi mốc thành ký hiệu ngắn đọc được. Thuần, không phụ thuộc
 * React — để test được và để mọi chỗ hiện danh sách dùng chung một bản.
 */

import { mathInlineRe } from "@/lib/math-delimiters";

/** Mốc → ký hiệu thay thế. Thứ tự có ý nghĩa: ảnh/video/audio trước, vì
 *  phần trong ngoặc của chúng có thể chứa dấu ngoặc vuông. */
const RULES: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/!\[[^\]]*\]\([^)]*\)/g, "🖼 "],
  [/\[video:[^\]]*\]/gi, "🎬 "],
  [/\[audio:[^\]]*\]/gi, "🔊 "],
  // Ô trống hiện đúng cái người soạn thấy trong đề Word: ba gạch dưới.
  [/\[blank:\d+\]/gi, "___"],
  [/\[zone:\d+\]/gi, "▭"],
  // Cụm gạch chân: CHÍNH nó là nội dung, giữ lại chữ và bỏ mốc.
  [/\[u:([^\]\n]+)\]/gi, "$1"],
  // Công thức: hiện ký hiệu ∑ (đúng nút chèn công thức trên thanh công cụ)
  // thay vì đổ LaTeX thô ra. Đề toán mà in `\frac{1}{3}` thì dòng xem trước
  // không còn đọc được chữ nào.
  [/\$\$[\s\S]+?\$\$/g, " ∑ "],
  [mathInlineRe(), " ∑ "],
];

export function previewText(content: string): string {
  let out = content ?? "";
  for (const [re, rep] of RULES) {
    out = out.replace(re, rep as string);
  }
  return out.replace(/[ \t]+/g, " ").trim();
}
