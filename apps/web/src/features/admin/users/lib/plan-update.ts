/**
 * AI: Tách một lần "sửa người dùng" thành hai việc khác nhau về bản chất.
 *
 * ── Lỗi mà file này khoá lại ────────────────────────────────────────────
 *
 * Hồ sơ người dùng nằm ở Firestore (`/users/{uid}`); MẬT KHẨU nằm ở Firebase
 * Auth — hai kho khác nhau, hai đường ghi khác nhau. Mật khẩu chỉ đặt được
 * bằng Admin SDK phía máy chủ (`/api/admin/reset-password`), client không
 * với tới.
 *
 * Hộp thoại "Chỉnh sửa người dùng" có ô mật khẩu, và nó gửi mật khẩu vào
 * cùng một `update()` với tên · lớp · trạng thái. Vòng lặp dọn dữ liệu
 * trước khi ghi Firestore có một dòng `if (k === "password") continue;` —
 * đúng về mặt "đừng ghi mật khẩu vào Firestore", nhưng nó DỪNG Ở ĐÓ. Mật
 * khẩu bị bỏ đi, không ai gọi đường đặt mật khẩu, và giao diện báo lưu
 * thành công.
 *
 * Hậu quả đúng như người dùng gặp: admin đổi mật khẩu cho `campusfs-0002`,
 * thấy lưu xong, học sinh đăng nhập vẫn báo sai mật khẩu. Không một thông
 * báo lỗi nào — thứ tệ hơn cả việc không có tính năng.
 *
 * Nên việc tách phải nằm ở một chỗ có thể kiểm thử được, và phải trả mật
 * khẩu RA NGOÀI thay vì nuốt mất.
 */

export interface UserUpdatePlan {
  /** Những trường ghi thẳng vào `/users/{uid}`. KHÔNG bao giờ chứa mật khẩu. */
  profilePatch: Record<string, unknown>;
  /** Mật khẩu mới cần đặt qua Admin SDK, hoặc null nếu lần này không đổi. */
  newPassword: string | null;
}

/** Firebase Auth từ chối mật khẩu ngắn hơn 6 ký tự. */
export const MIN_PASSWORD_LENGTH = 6;

export function planUserUpdate(
  patch: Record<string, unknown>,
): UserUpdatePlan {
  const profilePatch: Record<string, unknown> = {};
  let newPassword: string | null = null;

  for (const [k, v] of Object.entries(patch)) {
    if (k === "password") {
      // Ô mật khẩu để trống = "không đổi mật khẩu", không phải "đặt mật
      // khẩu rỗng". Chuỗi toàn khoảng trắng cũng vậy.
      if (typeof v === "string" && v.trim().length > 0) newPassword = v;
      continue;
    }
    if (v === undefined) continue;
    profilePatch[k] = v === null ? null : v;
  }

  return { profilePatch, newPassword };
}

/**
 * Câu báo lỗi khi hồ sơ đã lưu xong nhưng đặt mật khẩu thất bại.
 *
 * Hai việc ghi vào hai kho, không có giao dịch chung, nên nửa thành công là
 * trạng thái CÓ THẬT. Nói thẳng ra nửa nào đã xong — im lặng ở đây là quay
 * lại đúng cái lỗi cũ.
 */
export function partialSaveMessage(reason: string): string {
  return `Đã lưu thông tin hồ sơ, nhưng ĐỔI MẬT KHẨU THẤT BẠI: ${reason} — mật khẩu cũ vẫn đang có hiệu lực.`;
}
