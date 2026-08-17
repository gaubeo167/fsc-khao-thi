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

/**
 * Nhãn có phải chỉ là TÊN FILE hay không.
 *
 * Câu hỏi soạn trước bản này có nhãn được tự điền bằng tên file, và nhãn đó
 * đã nằm trong nội dung đã lưu — sửa chỗ tự điền không cứu được chúng. Nên
 * bắt ở lúc ĐỌC: nhãn trông như tên file thì thay bằng "Bài nghe".
 *
 * Dấu hiệu: có đuôi file âm thanh, hoặc không có khoảng trắng mà lại có gạch
 * nối/gạch dưới ("bai-nghe-de-2"). Nhãn người viết thật thì có dấu cách.
 */
export function looksLikeFileName(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|weba|webm)$/i.test(t)) return true;
  return !/\s/.test(t) && /[-_]/.test(t) && t.length > 8;
}

/** Đọc một mốc audio. Trả `null` nếu chuỗi không phải mốc audio. */
export function parseAudioMarker(snippet: string): AudioMarker | null {
  const m = AUDIO_RE.exec(snippet.trim());
  if (!m) return null;
  const n = m[3] ? Number(m[3]) : null;
  return {
    src: (m[1] ?? "").trim(),
    label: (() => {
      const raw = (m[2] ?? "").trim();
      return !raw || looksLikeFileName(raw) ? "Bài nghe" : raw;
    })(),
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
