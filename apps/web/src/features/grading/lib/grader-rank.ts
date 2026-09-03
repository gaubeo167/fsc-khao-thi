/**
 * AI được phân công AI chấm — luật thuần, KHÔNG dính React.
 *
 * ── Vì sao có ───────────────────────────────────────────────────────────
 *
 * Hộp "Phân công chấm" trước đây lọc người theo CƠ SỞ và MÔN, nhưng không
 * lọc theo BẬC. Hệ quả: Trưởng nhóm môn mở hộp ra là thấy cả Admin cơ sở và
 * Giám đốc chuyên môn trong danh sách "Giáo viên khả dụng", chọn được, lưu
 * được — TBM giao việc cho cấp trên. Đó là vượt quyền, và nó lặng lẽ: bản
 * ghi lưu thành công, người bị giao chỉ biết khi thấy việc lạ trong hàng đợi
 * chấm của mình.
 *
 * ── Luật ────────────────────────────────────────────────────────────────
 *
 *   - Bậc admin (`superadmin` · `academic-director` · `campus-admin`) phân
 *     công được cho BẤT KỲ ai đủ điều kiện — kể cả admin khác và chính mình.
 *     Đây đúng là việc của họ.
 *   - `subject-lead` (TBM) phân công được cho `teacher` và `subject-lead`
 *     — ngang bậc hoặc dưới, tức tổ chuyên môn của mình. KHÔNG với bậc admin.
 *   - Còn lại (`teacher`, `student`, không đăng nhập) không phân công ai.
 *
 * Luật này áp cho cả GẮN lẫn GỠ: TBM không gỡ được người chấm mà admin đã tự
 * nhận. Gỡ cũng là đụng vào phân công của cấp trên, và gỡ thì mất hẳn dấu.
 *
 * Đây là gợi ý giao diện. Cửa chặn thật nằm ở `firestore.rules`
 * (`graderRankOk`) — xem `scripts/test-grader-rank.mjs`.
 */

/** Bậc admin: không bị chặn bởi luật này, và không ai dưới bậc đụng tới được. */
const BAC_ADMIN = new Set(["superadmin", "academic-director", "campus-admin"]);

/** Bậc được nhận phân công từ TBM. */
const BAC_TO_CHUYEN_MON = new Set(["teacher", "subject-lead"]);

/**
 * Bậc được nhận phân công chấm, BẤT KỂ ai giao.
 *
 * Học sinh không nằm ở đây, và đây là vế phải kiểm riêng: nếu bậc admin được
 * cho qua vô điều kiện thì admin gán được học sinh làm người chấm — học sinh
 * đọc được bài của bạn cùng lớp và tự sửa điểm.
 */
const BAC_NHAN_PHAN_CONG = new Set([...BAC_TO_CHUYEN_MON, ...BAC_ADMIN]);

export function laBacAdmin(role: string | null | undefined): boolean {
  return role != null && BAC_ADMIN.has(role);
}

/**
 * Người có vai trò `vaiTroNguoiGiao` có được gắn / gỡ người chấm có vai trò
 * `vaiTroNguoiCham` không.
 */
export function coTheGiaoCham(
  vaiTroNguoiGiao: string | null | undefined,
  vaiTroNguoiCham: string | null | undefined,
): boolean {
  if (vaiTroNguoiGiao == null || vaiTroNguoiCham == null) return false;
  if (!BAC_NHAN_PHAN_CONG.has(vaiTroNguoiCham)) return false;
  if (BAC_ADMIN.has(vaiTroNguoiGiao)) return true;
  if (vaiTroNguoiGiao === "subject-lead") {
    return BAC_TO_CHUYEN_MON.has(vaiTroNguoiCham);
  }
  return false;
}

/** Câu giải thích khi một dòng bị khoá — hiện ngay cạnh chỗ bị khoá. */
export function lyDoKhongGiaoDuoc(
  vaiTroNguoiGiao: string | null | undefined,
  vaiTroNguoiCham: string | null | undefined,
): string | null {
  if (coTheGiaoCham(vaiTroNguoiGiao, vaiTroNguoiCham)) return null;
  if (vaiTroNguoiGiao === "subject-lead" && laBacAdmin(vaiTroNguoiCham)) {
    return "Trưởng nhóm môn không phân công chấm cho bậc admin. Nhờ admin cơ sở tự nhận hoặc tự gỡ.";
  }
  if (!BAC_NHAN_PHAN_CONG.has(vaiTroNguoiCham ?? "")) {
    return "Tài khoản này không thuộc diện được giao chấm bài.";
  }
  return "Tài khoản này không có quyền phân công người chấm.";
}

/** Người dùng — chỉ những trường mà luật này cần đọc. */
export interface UngVienCham {
  id: string;
  role?: string;
  status?: string;
  campusId?: string | null;
}

/**
 * Danh sách người được phép nhận phân công chấm cho MỘT ca thi.
 *
 * Ba vế cắt, theo thứ tự rẻ → đắt: trạng thái · bậc · cơ sở · môn. `dungMon`
 * nhận từ ngoài (chỗ gọi dùng `userTeachesSubject`) để module này chạy được
 * bằng node — không kéo theo kho môn và React.
 */
export function locNguoiChamKhaDung<U extends UngVienCham>(
  users: readonly U[],
  opts: {
    vaiTroNguoiGiao: string | null | undefined;
    /** `null` = ca thi không gắn cơ sở → không cắt theo cơ sở. */
    campusId?: string | null;
    dungMon: (u: U) => boolean;
  },
): U[] {
  return users.filter(
    (u) =>
      u.status === "active" &&
      coTheGiaoCham(opts.vaiTroNguoiGiao, u.role) &&
      (opts.campusId == null || u.campusId === opts.campusId) &&
      opts.dungMon(u),
  );
}
