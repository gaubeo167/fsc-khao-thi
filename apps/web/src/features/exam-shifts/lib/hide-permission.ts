/**
 * Ai được ẨN / HIỆN một ca thi khỏi danh sách vận hành.
 *
 * ── Ẩn KHÁC xoá, và khác huỷ ────────────────────────────────────────────
 *
 *   • ẨN   — chỉ là chuyện HIỂN THỊ, nhưng là hiển thị của CẢ hai màn vận
 *            hành: danh sách ca thi VÀ "Kết quả & Báo cáo". Ẩn ở một chỗ mà
 *            còn ở chỗ kia thì chưa gọi là bớt rối — người dùng vẫn phải
 *            cuộn qua đúng những ca đã dọn đi. Dữ liệu thì nguyên vẹn: bài
 *            làm, điểm, minh chứng không mất, số liệu tính lại được ngay khi
 *            bỏ ẩn. Học sinh KHÔNG bị ảnh hưởng — màn "Lịch sử bài thi" và
 *            màn kết quả của học sinh không hề lọc theo `archivedAt`.
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
  /** Cần cho `canPublishResults` — chủ ca thi cũng được sửa ca của mình. */
  userId?: string | null;
}

export type HideVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/** Chỉ cần ngần này của ca thi. */
export type HideTarget = Pick<ExamShift, "status" | "startAt" | "endAt"> & {
  campusId?: string | null;
  archivedAt?: string | null;
  ownerId?: string | null;
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

/**
 * Cắt ra những ca được HIỆN trong màn "Kết quả & Báo cáo".
 *
 * Cùng một luật với danh sách ca thi: ca đã ẩn thì biến khỏi mọi thứ tính từ
 * nó — bảng ca thi, KPI, biểu đồ, file CSV/Excel xuất ra, và bảng giờ coi
 * thi. Đếm hụt thầm lặng là cái bẫy ở đây (bảng giờ coi thi dùng để tính
 * công), nên chỗ gọi phải NÓI RA còn bao nhiêu ca đang bị ẩn và cho bật lại
 * — xem `includeHidden`.
 *
 * Không đụng gì tới màn của học sinh: kết quả và lịch sử bài thi của các em
 * lấy thẳng từ `attempts`, không đi qua đây.
 */
export function shiftsVisibleInReports<
  T extends { archivedAt?: string | null },
>(shifts: readonly T[], opts?: { includeHidden?: boolean }): T[] {
  if (opts?.includeHidden) return [...shifts];
  return shifts.filter((s) => !s.archivedAt);
}

/** Số ca đang bị ẩn trong một tập — để màn báo cáo nói ra thay vì đếm hụt. */
export function countHiddenShifts(
  shifts: readonly { archivedAt?: string | null }[],
): number {
  return shifts.filter((s) => s.archivedAt).length;
}

/**
 * Ai được đụng vào ca thi sau khi nó kết thúc — công bố điểm, đổi trạng thái.
 *
 * ── Vì sao phải khớp CHÍNH XÁC với firestore.rules ──────────────────────
 *
 * Rules cho `/shifts` là `allow update: if isAdmin() || resource.data.ownerId
 * == uid()`. Giao diện rộng hơn rules là cái bẫy tệ nhất trong hệ này: kho
 * zustand đổi lạc quan TRƯỚC, `patchDoc` ghi nền và NUỐT lỗi, nên người dùng
 * thấy hộp thoại đóng lại như đã lưu, tải lại trang mới biết là không.
 *
 * Đúng lỗi Khánh Linh báo ở phân công chấm. Nên ở đây khai đúng bằng rules,
 * không rộng hơn một ly.
 *
 * (Muốn cho Trưởng nhóm môn công bố điểm cho ca môn mình thì phải NỚI RULES
 * trước, rồi mới nới chỗ này — không làm ngược lại.)
 */
export function canPublishResults(
  actor: HideActor | null | undefined,
  shift: HideTarget | null | undefined,
): HideVerdict {
  if (!shift) return { ok: false, reason: "Không tìm thấy ca thi." };
  if (isCampusRoot(actor, shift.campusId ?? null)) return { ok: true };
  if (actor?.userId && shift.ownerId && actor.userId === shift.ownerId) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      "Chỉ admin cơ sở, tài khoản admin gốc, hoặc người tạo ca thi mới công bố điểm / đổi trạng thái ca này được.",
  };
}
