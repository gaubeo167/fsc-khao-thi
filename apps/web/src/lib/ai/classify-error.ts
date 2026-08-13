/**
 * Phân loại lỗi trả về từ các route `/api/ai/*` để UI hiện đúng thông điệp.
 *
 * Tách riêng khỏi component vì HTTP status một mình KHÔNG đủ để biết chuyện
 * gì hỏng: route AI trả 401 cho hai tình huống khác hẳn nhau.
 *
 *   1. `verifyCaller` từ chối người gọi  → `{ error: "unauthorized" }` · 401
 *      Phiên đăng nhập của học sinh hết hạn. Không liên quan gì tới AI.
 *   2. Nhà cung cấp AI từ chối API key   → `{ error: "ai_failed" }`   · 401
 *      Đây mới là lỗi cấu hình key trên server.
 *
 * Bản cũ chỉ nhìn `res.status` nên gộp cả hai thành "API key sai", và học
 * sinh có token hết hạn bị bảo đi nhắc admin kiểm tra ANTHROPIC_API_KEY trên
 * Vercel — chẩn đoán sai, đồng thời lộ tên biến môi trường + nhà cung cấp
 * hosting cho học sinh. Trường `error` trong body mới là thứ phân biệt được.
 */

export type AiErrorKind = "overload" | "session" | "config" | "other";

/** Mã lỗi `verifyCaller` phát ra khi người gọi chưa/không còn hợp lệ. */
const CALLER_ERRORS = new Set(["unauthorized", "forbidden"]);

export function classifyAiError(status: number, body: unknown): AiErrorKind {
  const b = (body ?? {}) as { error?: unknown; message?: unknown };
  const code = typeof b.error === "string" ? b.error : "";
  const message = typeof b.message === "string" ? b.message : "";

  // Quá tải phía nhà cung cấp — có đường tự thử lại nên xét trước.
  if (
    status === 429 ||
    status === 503 ||
    status === 529 ||
    /overload|high demand|try again later/i.test(message)
  ) {
    return "overload";
  }

  // Người gọi hết phiên: luôn ưu tiên mã lỗi trong body hơn HTTP status.
  if (CALLER_ERRORS.has(code)) return "session";

  // Chỉ khi chính lời gọi AI bị từ chối mới là lỗi cấu hình key.
  if (code === "ai_failed" && (status === 401 || status === 403)) {
    return "config";
  }

  // 401/403 không kèm mã lỗi nào nhận ra được: nghiêng về phía phiên đăng
  // nhập. Đó là nguyên nhân thường gặp hơn nhiều, và thông điệp phiên đăng
  // nhập thì vô hại khi đoán sai — còn thông điệp "sai API key" thì không.
  if (status === 401 || status === 403) return "session";

  return "other";
}
