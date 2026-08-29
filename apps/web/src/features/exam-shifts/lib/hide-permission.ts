/**
 * Ai được ẨN / HIỆN một ca thi khỏi danh sách vận hành.
 *
 * ── Ẩn KHÁC xoá, và khác huỷ ────────────────────────────────────────────
 *
 *   • ẨN   — chỉ là chuyện HIỂN THỊ. Ca biến khỏi danh sách của bộ phận vận
 *            hành cho đỡ rối, còn dữ liệu nguyên vẹn: bài làm, điểm, minh
 *            chứng, báo cáo đều không đổi. Học sinh KHÔNG bị ảnh hưởng — màn
 *            "Lịch sử bài thi" và màn kết quả không hề lọc theo `archivedAt`.
 *   • HUỶ  — đổi TRẠNG THÁI ca (`status = "cancelled"`), nói rằng buổi thi đó
 *            không diễn ra. Là chuyện nghiệp vụ, không phải chuyện màn hình.
 *   • XOÁ  — cấm với ca đã có bài làm. Minh chứng thi không được phép mất.
 *
 * Ba thứ này từng bị gộp làm một trong giao diện: nút duy nhất để ca biến
 * khỏi danh sách là nút thùng rác, và hộp thoại của nó hiện chữ "Xoá ca thi?"
 * rồi tự chặn lại vì ca đã có bài làm. Kết quả: ca đã kết thúc — tức MỌI ca
 * có bài làm — không ai ẩn được, kể cả tài khoản admin gốc. Danh sách vận
 * hành cứ thế dài mãi.
 *
 * ── Hai điều kiện ───────────────────────────────────────────────────────
 *
 * 1. NGƯỜI: chỉ admin gốc (`superadmin`) và admin trường của ĐÚNG cơ sở đó
 *    (`campus-admin`). Cùng bậc quyền với `whyDeleteBlocked` trong màn ca thi
 *    — ẩn một ca là quyết định của người quản lý danh sách, không phải của
 *    người tạo ca.
 *
 * 2. CA: phải KẾT THÚC rồi (đã hoàn thành hoặc đã huỷ). Cho ẩn ca sắp thi là
 *    giấu mất lịch thi khỏi chính người phải chuẩn bị cho nó; cho ẩn ca đang
 *    thi là giấu mất phòng giám sát đang chạy.
 */

import { effectiveShiftStatus, type ExamShift } from "../data/types";

/** Đủ để trả lời, hợp với cả phiên đăng nhập thật lẫn vật giả trong test. */
export interface HideActor {
  role?: string | null;
  campusId?: string | null;
}

export type HideVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/** Chỉ cần ngần này của ca thi. */
export type HideTarget = Pick<ExamShift, "status" | "startAt" | "endAt"> & {
  campusId?: string | null;
  archivedAt?: string | null;
};

/** Người này có ở bậc quản lý danh sách của cơ sở đó không. */
export function isCampusRoot(
  actor: HideActor | null | undefined,
  campusId: string | null | undefined,
): boolean {
  if (!actor) return false;
  if (actor.role === "superadmin") return true;
  return actor.role === "campus-admin" && actor.campusId === campusId;
}

/**
 * Được ẩn ca này không.
 *
 * `reason` viết cho NGƯỜI DÙNG đọc, không phải cho lập trình viên — nó hiện
 * thẳng lên nút và lên hộp thoại.
 */
export function canHideShift(
  actor: HideActor | null | undefined,
  shift: HideTarget | null | undefined,
): HideVerdict {
  if (!shift) return { ok: false, reason: "Không tìm thấy ca thi." };
  if (!isCampusRoot(actor, shift.campusId ?? null)) {
    return {
      ok: false,
      reason:
        "Chỉ admin cơ sở của chính cơ sở này và tài khoản admin gốc mới ẩn được ca thi.",
    };
  }
  // Đã ẩn rồi thì không "ẩn" được nữa. Không phải bắt bẻ chữ nghĩa: chỗ gọi
  // dùng chính hàm này để quyết định có vẽ ô tích và nút Ẩn hay không, nên
  // thiếu vế này là dòng đã ẩn vẫn mời người dùng ẩn lần nữa, bấm xong ra
  // "Ẩn 0 ca".
  if (shift.archivedAt) {
    return { ok: false, reason: "Ca này đã ẩn từ trước." };
  }
  const eff = effectiveShiftStatus(shift);
  if (eff !== "completed" && eff !== "cancelled") {
    return {
      ok: false,
      reason:
        "Chỉ ẩn được ca đã kết thúc hoặc đã huỷ. Ca chưa thi mà ẩn đi là giấu mất lịch thi của chính người phải chuẩn bị cho nó.",
    };
  }
  return { ok: true };
}

/** Hiện lại ca đã ẩn — cùng bậc quyền, không cần điều kiện trạng thái. */
export function canUnhideShift(
  actor: HideActor | null | undefined,
  shift: HideTarget | null | undefined,
): HideVerdict {
  if (!shift) return { ok: false, reason: "Không tìm thấy ca thi." };
  if (!isCampusRoot(actor, shift.campusId ?? null)) {
    return {
      ok: false,
      reason:
        "Chỉ admin cơ sở của chính cơ sở này và tài khoản admin gốc mới hiện lại được ca thi.",
    };
  }
  return { ok: true };
}

/**
 * Lọc ra những ca ẩn được trong một tập đã chọn.
 *
 * Dùng cho thao tác hàng loạt — ẩn từng ca một thì không gọi là bớt rối.
 * Trả về cả phần BỎ QUA kèm lý do, để màn hình nói rõ "3 ca không ẩn được vì
 * chưa kết thúc" chứ không lặng lẽ ẩn 7 trong 10 ca người dùng đã tích.
 */
export function planBulkHide<T extends HideTarget & { id: string }>(
  actor: HideActor | null | undefined,
  shifts: readonly T[],
): { hide: T[]; skip: Array<{ shift: T; reason: string }> } {
  const hide: T[] = [];
  const skip: Array<{ shift: T; reason: string }> = [];
  for (const s of shifts) {
    if (s.archivedAt) {
      skip.push({ shift: s, reason: "Đã ẩn từ trước." });
      continue;
    }
    const v = canHideShift(actor, s);
    if (v.ok) hide.push(s);
    else skip.push({ shift: s, reason: v.reason });
  }
  return { hide, skip };
}
