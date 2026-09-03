/**
 * Luật thuần của cầu nối phát file nghe trên Google Drive.
 *
 * Tách khỏi `app/api/media/audio/route.ts` vì file route của Next chỉ được
 * xuất ra đúng vài tên đã định (`GET`, `runtime`…) — xuất thêm là build hỏng,
 * nên không test thẳng vào đó được. Mà đây đúng là chỗ cần khoá: nhận nhầm
 * một TRANG HTML là âm thanh thì máy phát lại đứng ở 0:00 y như cũ.
 *
 * Xem `scripts/test-drive-audio.mjs`.
 */

/** Mã file Drive — chỉ chữ, số, `-`, `_`. Chặn luôn mọi thứ khác. */
export const MA_FILE_DRIVE = /^[\w-]{10,200}$/;

export function laMaFileDrive(id: string | null | undefined): boolean {
  return typeof id === "string" && MA_FILE_DRIVE.test(id);
}

/**
 * Thứ lấy về có phải âm thanh không.
 *
 * Drive hay trả `application/octet-stream` cho file tải lên — vẫn nhận, vì
 * đó là byte thật. Chỉ chặn `text/html`: đó chính là trang đăng nhập / trang
 * hỏi quét virus đội lốt file nghe, và là nguyên nhân của cái máy phát câm.
 *
 * Thiếu hẳn `Content-Type` thì cho qua: chặn ở đây là chặn nhầm những máy
 * chủ tử tế nhưng cấu hình sơ sài, mà `<audio>` vẫn tự dò được theo byte.
 */
export function laKieuAmThanh(contentType: string | null | undefined): boolean {
  if (!contentType) return true;
  const t = contentType.toLowerCase();
  if (t.startsWith("text/") || t.includes("html")) return false;
  return (
    t.startsWith("audio/") ||
    // .weba / .m4a đôi khi bị Drive gắn nhãn video — vẫn là tiếng.
    t.startsWith("video/") ||
    t.includes("octet-stream") ||
    t.includes("binary")
  );
}

/** URL tải thẳng của Drive. `confirm` dùng khi phải qua trang quét virus. */
export function urlTaiDrive(id: string, confirm?: string | null): string {
  const u = new URL("https://drive.usercontent.google.com/download");
  u.searchParams.set("id", id);
  u.searchParams.set("export", "download");
  if (confirm) u.searchParams.set("confirm", confirm);
  return u.toString();
}

/**
 * Trang "không quét virus được" của Drive có một form kèm mã xác nhận. Móc
 * mã ra để gọi lại lần nữa — file nghe dài hay rơi vào đúng trang này.
 */
export function macXacNhanDrive(html: string): string | null {
  const m =
    /name="confirm"\s+value="([^"]+)"/.exec(html) ??
    /[?&]confirm=([\w-]+)/.exec(html);
  return m ? m[1]! : null;
}

/**
 * Mã lỗi HTTP của Google → câu nói cho người dùng.
 *
 * `null` = không phải lỗi. Câu chữ phải nói ĐƯỢC PHẢI LÀM GÌ: người đọc là
 * giáo viên đang soạn đề, không phải lập trình viên, và họ đọc nó lúc đang
 * vội.
 */
export function loiTuDrive(status: number): string | null {
  if (status === 401 || status === 403) {
    return (
      'Google Drive từ chối: file chưa mở chia sẻ công khai. Đặt quyền "Bất kỳ ' +
      'ai có đường liên kết" ở mức "Người xem", rồi thử lại.'
    );
  }
  if (status === 404) {
    return "Không tìm thấy file trên Google Drive — kiểm tra lại đường dẫn.";
  }
  if (status === 200 || status === 206) return null;
  return `Google Drive trả lỗi ${status}. Thử lại, hoặc tải thẳng file lên.`;
}

/** Nhận về HTML thay vì tiếng, và không móc được mã xác nhận. */
export const LOI_TRA_VE_TRANG_WEB =
  "Google Drive trả về một trang web chứ không phải file âm thanh. Thường là " +
  "do file chỉ chia sẻ trong nội bộ trường: mở lại quyền thành \"Bất kỳ ai có " +
  'đường liên kết", hoặc tải thẳng file lên hệ thống.';

/** Qua cả bước xác nhận rồi vẫn ra HTML. */
export const LOI_KHONG_TAI_THANG_DUOC =
  "Google Drive không cho tải thẳng file này (file quá lớn hoặc bị chặn quét " +
  "virus). Tải file lên hệ thống thay vì dán link Drive.";

/**
 * Ngưỡng "file nghe quá nặng" — bằng đúng giới hạn tải file lên của hệ thống
 * (`MAX_QUESTION_AUDIO_BYTES`, 20MB). Trên ngưỡng này thì link Drive không
 * còn là chuyện tiện hay không tiện nữa, nó là chuyện băng thông.
 */
export const NGUONG_NANG_BYTES = 20 * 1024 * 1024;

/**
 * Câu cảnh báo dung lượng, hiện lúc SOẠN chứ không phải lúc thi.
 *
 * Một file nghe 46MB nhân với một ca 1700 học sinh là ~77GB tải về. Trên
 * mạng wifi trường thì không phải "chậm", mà là không mở nổi — và chỉ vỡ ra
 * đúng lúc cả phòng bấm play cùng lúc.
 *
 * Gần như luôn nén được rất sâu mà không mất chữ nào: bài nghe là TIẾNG NÓI,
 * thu stereo 192 kbps là thừa. Chuyển sang mono 64 kbps giữ nguyên độ dài,
 * nghe không khác, mà nhỏ đi khoảng ba lần.
 *
 * `null` = không có gì phải nói.
 */
export function canhBaoDungLuong(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= NGUONG_NANG_BYTES) {
    return null;
  }
  const mb = Math.round(bytes / (1024 * 1024));
  return (
    `File nghe nặng ${mb} MB — cả phòng thi tải cùng lúc sẽ nghẽn. Bài nghe là ` +
    "tiếng nói nên nén sâu được mà không mất chữ: xuất lại dạng mono 64 kbps " +
    "thường nhỏ đi khoảng ba lần, rồi tải thẳng file lên (nút bên cạnh) thay " +
    "vì dán link."
  );
}

/**
 * Header trả về cho `<audio>`.
 *
 * Ba chỗ phải sửa so với thứ Drive gửi:
 *
 *   1. `application/octet-stream` làm Safari không chịu phát. Đặt về
 *      `audio/mpeg` — kiểu áp đảo của file nghe; trình duyệt vẫn tự dò theo
 *      byte thật.
 *   2. Bỏ `Content-Disposition: attachment` của Drive, nếu không trình duyệt
 *      tải file xuống thay vì phát.
 *   3. Giữ `Accept-Ranges` / `Content-Range` — thiếu là mất tua, mà bài nghe
 *      dài không tua được thì không dùng nổi.
 */
export function headerAmThanh(
  tuDrive: Headers,
  cacheControl: string,
): Headers {
  const h = new Headers();
  const ct = tuDrive.get("content-type");
  h.set(
    "content-type",
    ct && ct.toLowerCase().startsWith("audio/") ? ct : "audio/mpeg",
  );
  for (const k of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = tuDrive.get(k);
    if (v) h.set(k, v);
  }
  h.set("accept-ranges", tuDrive.get("accept-ranges") ?? "bytes");
  h.set("cache-control", cacheControl);
  h.set("content-disposition", "inline");
  h.set("x-content-type-options", "nosniff");
  return h;
}
