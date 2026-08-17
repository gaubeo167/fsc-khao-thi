/**
 * Mốc audio trong nội dung câu hỏi, kèm GIỚI HẠN SỐ LẦN NGHE.
 *
 *     [audio:https://… | Bài nghe số 1]        nghe thoải mái
 *     [audio:https://… | Bài nghe số 1 | 2]    chỉ được nghe 2 lần
 *
 * ── Vì sao đặt số lần vào chính cái mốc ─────────────────────────────────
 *
 * Đề nghe thường có nhiều bài trong một câu, mỗi bài một quy định khác nhau
 * (bài dẫn nghe thoải mái, bài thi chỉ 2 lần). Một trường "số lần nghe" ở
 * cấp câu hỏi không diễn tả được chuyện đó.
 *
 * Quan trọng hơn: nội dung câu hỏi được ĐÓNG BĂNG vào đề khi sinh mã đề. Số
 * lần nghe nằm trong nội dung thì nó đóng băng theo — sửa câu hỏi gốc sau
 * khi thi xong không làm đổi luật của ca thi đã diễn ra. Nếu để ở một trường
 * riêng của câu hỏi thì phải nhớ chép nó vào mọi bản chụp, và quên một chỗ
 * là ca thi chấm theo luật khác với lúc thi.
 */

/** `[audio:nguồn | nhãn | số lần]` — số lần là tuỳ chọn. */
const AUDIO_RE = /^\[audio:([^|\]]+?)\s*(?:\|\s*([^|\]]*?)\s*)?(?:\|\s*(\d+)\s*)?\]$/;

export interface AudioMarker {
  src: string;
  label: string;
  /** `null` = không giới hạn. Số ≥ 1 = số lần được bấm nghe. */
  maxPlays: number | null;
}

/** Đọc một mốc audio. Trả `null` nếu chuỗi không phải mốc audio. */
export function parseAudioMarker(snippet: string): AudioMarker | null {
  const m = AUDIO_RE.exec(snippet.trim());
  if (!m) return null;
  const n = m[3] ? Number(m[3]) : null;
  return {
    src: (m[1] ?? "").trim(),
    label: (m[2] ?? "").trim() || "Bài nghe",
    // 0 lần nghe là vô nghĩa (chèn audio rồi cấm nghe) — hiểu là không giới hạn.
    maxPlays: n != null && n >= 1 ? n : null,
  };
}

/** Dựng mốc audio. Bỏ trống `maxPlays` thì không ghi phần giới hạn. */
export function buildAudioMarker(
  src: string,
  label: string,
  maxPlays?: number | null,
): string {
  const l = (label.trim() || "Bài nghe").replaceAll("]", "\\]").replaceAll("|", "-");
  const limit = maxPlays != null && maxPlays >= 1 ? ` | ${Math.floor(maxPlays)}` : "";
  return `[audio:${src.trim()} | ${l}${limit}]`;
}

/**
 * Khoá đếm lượt nghe của một bài audio trong một câu.
 *
 * Đếm theo THỨ TỰ XUẤT HIỆN trong nội dung, không theo đường dẫn: hai bài
 * nghe trong cùng một câu có thể trỏ về cùng một file (bản đầy đủ và bản
 * trích), mà quy định số lần của chúng khác nhau.
 */
export function audioPlayKey(questionId: string, index: number): string {
  return `${questionId}#${index}`;
}
