/**
 * MỘT chỗ định nghĩa mốc công thức `$…$` / `$$…$$`.
 *
 * ── Vì sao gom về một chỗ ────────────────────────────────────────────────
 *
 * Cùng một biểu thức chính quy này từng nằm rải ở 5 file: bộ hiển thị, ô soạn
 * thảo (hai chỗ), bộ đọc dán từ Word, và dòng xem trước. Sửa một chỗ mà quên
 * bốn chỗ kia thì công thức hiện đúng ở màn này, vỡ ở màn khác — và không có
 * gì báo.
 *
 * ── Vì sao phải cho phép `\$` bên trong ──────────────────────────────────
 *
 * Công thức trong đề thật có tiền: file AIMO có một khối công thức Word mà
 * nội dung đúng nguyên văn là `$140÷1-70%≈$466`. Dấu `$` của đồng đô la nằm
 * NGAY TRONG công thức, đụng thẳng vào dấu `$` dùng làm mốc.
 *
 * Bộ đọc OMath thoát chúng thành `\$` (xem `omath-to-latex.ts`), nên mốc phải
 * chấp nhận `\$` ở giữa. Biểu thức cũ dùng `[^\n$]` — cấm tiệt dấu `$` bên
 * trong — nên nó cắt công thức ngay tại dấu đô la đầu tiên: người dùng thấy
 * một thẻ công thức hỏng, rồi `466$` rơi ra ngoài thành chữ thường.
 */

/** `$$…$$` — công thức khối. */
export const MATH_BLOCK_SRC = "\\$\\$[\\s\\S]+?\\$\\$";

/** `$…$` — công thức trong dòng, cho phép `\$` (đô la) ở giữa. */
export const MATH_INLINE_SRC = "\\$(?:\\\\\\$|[^\\n$])+?\\$";

/** `$$…$$` hoặc `$…$`. Khối đứng trước để không bị mốc trong dòng ăn mất. */
export const MATH_ANY_SRC = `${MATH_BLOCK_SRC}|${MATH_INLINE_SRC}`;

/**
 * Regex mới mỗi lần gọi.
 *
 * Regex có cờ `g` mang trạng thái `lastIndex`; dùng chung một đối tượng giữa
 * nhiều lần gọi là thỉnh thoảng bỏ sót công thức, và lỗi kiểu đó chỉ hiện ra
 * ở lần render thứ hai.
 */
export const mathAnyRe = (flags = "g") => new RegExp(`(${MATH_ANY_SRC})`, flags);
export const mathInlineRe = (flags = "g") => new RegExp(MATH_INLINE_SRC, flags);
