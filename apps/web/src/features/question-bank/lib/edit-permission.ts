/**
 * AI: Ai được SỬA TRỰC TIẾP một câu hỏi đã dùng trong đề thi.
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Trước đây câu đã đóng băng vào đề là KHOÁ CỨNG: mọi người, kể cả admin,
 * bấm Sửa đều chỉ nhận được một lựa chọn duy nhất — "Tạo phiên bản mới".
 * Người dùng nói đúng chỗ đau: sửa xong thì đó là một câu KHÁC (id khác,
 * trạng thái nháp), nên chấm lại ca thi cũ chẳng biết bám vào đâu.
 *
 * Cái khoá đó bảo vệ nhầm chỗ. Thứ giữ toàn vẹn dữ liệu KHÔNG phải là chuỗi
 * phiên bản, mà là bản đề đã đóng băng trong `exam_forms` — nó chứa bản chụp
 * riêng của từng câu. Sửa câu trong ngân hàng không đụng được vào bản chụp
 * đó, nên đề học sinh đã đọc vẫn nguyên vẹn dù ta sửa gốc.
 *
 * Vậy thứ cần canh không phải là "có được sửa không" mà là "AI được sửa".
 *
 * ── Luật ────────────────────────────────────────────────────────────────
 *
 *   • superadmin / academic-director / campus-admin  → sửa được (trong cơ sở)
 *   • subject-lead (trưởng bộ môn)  → sửa được ĐÚNG môn + khối được giao
 *   • teacher và các vai khác       → không; vẫn tạo phiên bản mới như cũ
 *
 * Quy ước `gradeIds` rỗng = phụ trách MỌI khối trong môn được giao — giống
 * hệt `useUserScope`, cố ý không đẻ thêm luật thứ hai. Sáu bản sao của một
 * luật phạm vi là thứ đã gây ra vụ "mục lục khối 1 mượn của khối 10".
 *
 * Hàm luôn trả kèm `reason` kể cả khi CHO PHÉP: hộp thoại phải nói ra vì sao
 * — không có chuyện nút mờ đi mà không giải thích.
 */
import type { Role } from "@/features/auth/state/auth-store";

/** Phạm vi của người đang thao tác. Lấy thẳng từ `useUserScope()`. */
export interface EditActorScope {
  role: Role;
  /** null = không giới hạn môn (vai trò quản trị). */
  allowedSubjectIds: Set<string> | null;
  /** null = không giới hạn khối trong các môn được giao. */
  allowedGradeIds: Set<string> | null;
}

export interface EditVerdict {
  allowed: boolean;
  /** Câu giải thích cho người dùng, luôn có. */
  reason: string;
}

/** Vai trò quản trị — sửa được mọi môn trong cơ sở của mình. */
const ADMIN_ROLES = new Set<Role>([
  "superadmin",
  "academic-director",
  "campus-admin",
]);

export function canEditInPlace(
  actor: EditActorScope | null | undefined,
  question: { subjectId?: string | null; gradeId?: string | null },
  /** Tên hiển thị để câu giải thích đọc được, không phải mã. */
  labels?: { subject?: string | null; grade?: string | null },
): EditVerdict {
  const monName = labels?.subject?.trim() || question.subjectId || "môn này";
  const khoiName = labels?.grade?.trim() || question.gradeId || "khối này";

  if (!actor) {
    return { allowed: false, reason: "Chưa đăng nhập." };
  }
  if (ADMIN_ROLES.has(actor.role)) {
    return {
      allowed: true,
      reason: "Bạn là quản trị — sửa được câu của mọi môn trong cơ sở.",
    };
  }
  if (actor.role !== "subject-lead") {
    return {
      allowed: false,
      reason: `Chỉ admin hoặc trưởng bộ môn phụ trách ${monName} · ${khoiName} mới được sửa trực tiếp câu đã dùng trong đề.`,
    };
  }

  // ── Trưởng bộ môn: phải đúng môn, rồi mới đến khối ────────────────────
  if (!question.subjectId) {
    return {
      allowed: false,
      reason:
        "Câu này chưa gắn môn nên không xác định được ai phụ trách. Nhờ admin gắn môn trước.",
    };
  }
  if (actor.allowedSubjectIds && !actor.allowedSubjectIds.has(question.subjectId)) {
    return {
      allowed: false,
      reason: `Bạn không được giao ${monName}. Trưởng bộ môn chỉ sửa trực tiếp trong môn mình phụ trách.`,
    };
  }
  if (!actor.allowedSubjectIds) {
    // Không nên xảy ra với subject-lead, nhưng nếu phạm vi rỗng nghĩa là
    // admin chưa giao môn nào — không suy diễn thành "được tất".
    return {
      allowed: false,
      reason: "Bạn chưa được giao môn nào. Nhờ admin gán môn · khối phụ trách.",
    };
  }
  if (actor.allowedGradeIds) {
    if (!question.gradeId) {
      return {
        allowed: false,
        reason: `Câu này chưa gắn khối nên không đối chiếu được với khối bạn phụ trách.`,
      };
    }
    if (!actor.allowedGradeIds.has(question.gradeId)) {
      return {
        allowed: false,
        reason: `Bạn phụ trách ${monName} nhưng không phụ trách ${khoiName}.`,
      };
    }
  }
  return {
    allowed: true,
    reason: `Bạn là trưởng bộ môn phụ trách ${monName} · ${khoiName}.`,
  };
}
