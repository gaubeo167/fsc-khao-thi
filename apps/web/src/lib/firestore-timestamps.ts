/**
 * Firestore Timestamp → chuỗi ISO, ngay tại chỗ ĐỌC.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * `writeDoc`/`patchDoc` GHI ĐÈ `updatedAt` bằng `serverTimestamp()` — cố ý,
 * để giờ do máy chủ quyết chứ không do đồng hồ máy người dùng. Nhưng kiểu dữ
 * liệu trong mã lại khai `updatedAt: string`, và mọi màn hình đều làm
 * `new Date(row.updatedAt)`.
 *
 * Đọc về thì `updatedAt` là một ĐỐI TƯỢNG Timestamp, không phải chuỗi. Truyền
 * đối tượng đó cho `new Date()` ra Invalid Date — người dùng thấy
 * "Đã có bản lưu (cập nhật Invalid Date)".
 *
 * Chỗ này khó thấy vì `tsc` vẫn xanh: kiểu khai là `string` nên không ai kiểm
 * lại, và lỗi chỉ hiện ra khi dữ liệu đã đi một vòng qua Firestore thật. Chạy
 * trên dữ liệu mẫu trong máy thì không bao giờ gặp.
 *
 * ── Vì sao sửa ở đây ────────────────────────────────────────────────────
 *
 * Mọi kho dữ liệu đều đọc qua `subscribeCollection`. Vá ở đó là một chỗ cho
 * tất cả; vá ở từng màn thì màn nào quên lại hỏng tiếp, mà lại chỉ hỏng trên
 * production.
 *
 * Không chỗ nào trong mã gọi `.toDate()`, nên đổi sang chuỗi ISO chỉ có lợi.
 */

/** Sâu tối đa khi đi vào các trường lồng nhau — chặn dữ liệu bệnh làm treo. */
const MAX_DEPTH = 8;

interface TimestampLike {
  seconds: number;
  nanoseconds: number;
}

function isTimestampLike(v: object): v is TimestampLike {
  return (
    typeof (v as TimestampLike).seconds === "number" &&
    typeof (v as TimestampLike).nanoseconds === "number"
  );
}

/** Đối tượng này có phải object thuần không — Bytes · GeoPoint · Date thì không. */
function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Đổi mọi Timestamp trong một bản ghi thành chuỗi ISO, giữ nguyên phần còn
 * lại. Trả về chính đối tượng cũ nếu không có gì phải đổi — để React không
 * dựng lại danh sách chỉ vì bản sao mới.
 */
export function normalizeTimestamps<T>(value: T, depth = 0): T {
  if (value == null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return value;

  const obj = value as unknown as object;

  // Timestamp thật của SDK có `toDate()`; bản đọc từ REST/emulator có thể chỉ
  // còn hai trường số. Nhận cả hai.
  const toDate = (obj as { toDate?: unknown }).toDate;
  if (typeof toDate === "function") {
    try {
      const d = (toDate as () => Date).call(obj);
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString() as unknown as T;
      }
    } catch {
      return value;
    }
    return value;
  }
  if (isTimestampLike(obj)) {
    const ms = obj.seconds * 1000 + Math.round(obj.nanoseconds / 1e6);
    const d = new Date(ms);
    return (Number.isNaN(d.getTime()) ? value : (d.toISOString() as unknown as T));
  }
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? value : (obj.toISOString() as unknown as T);
  }

  if (Array.isArray(obj)) {
    let doi = false;
    const out = obj.map((v) => {
      const n = normalizeTimestamps(v, depth + 1);
      if (n !== v) doi = true;
      return n;
    });
    return (doi ? out : value) as unknown as T;
  }

  // Bytes · GeoPoint · DocumentReference… để nguyên, đi vào là hỏng.
  if (!isPlainObject(obj)) return value;

  let doi = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = normalizeTimestamps(v, depth + 1);
    if (n !== v) doi = true;
    out[k] = n;
  }
  return (doi ? out : value) as unknown as T;
}
