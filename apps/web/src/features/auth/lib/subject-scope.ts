/**
 * Người dùng phụ trách môn nào — luật thuần, KHÔNG dính React.
 *
 * Tách khỏi `use-scope.ts` để chạy test được bằng node: `use-scope` là module
 * "use client" kéo theo cả kho zustand và firebase, đóng gói ra là lôi luôn
 * grpc vào — không chạy nổi ngoài trình duyệt. Mà đây đúng là chỗ cần khoá
 * chặt nhất: nới ra một chút là lộ dữ liệu môn khác.
 *
 * Xem `scripts/test-subject-scope.mjs`.
 */

/**
 * Môn mà MỘT người dùng bất kỳ phụ trách.
 *
 * Tách ra khỏi `useResolveScope` vì có hai chỗ cần hỏi về NGƯỜI KHÁC chứ
 * không phải người đang đăng nhập: ô chọn giáo viên chấm bài (chỉ hiện GV
 * cùng môn với ca thi) và các màn lọc theo môn. Viết luật thứ hai ở đó là
 * hai chỗ trôi khỏi nhau — mà lệch phân quyền thì không ai thấy cho tới lúc
 * lộ dữ liệu môn khác.
 *
 * Bậc admin (`superadmin` · `academic-director` · `campus-admin`) trả `null`
 * = không giới hạn, đúng như `allowedSubjectIds` của `useResolveScope`.
 */
export function subjectIdsOfUser(
  u: { role?: string; subjectIds?: string[]; subject?: string } | null | undefined,
  subjects: { id: string; name: string; code?: string }[],
): Set<string> | null {
  if (!u) return new Set();
  if (
    u.role === "superadmin" ||
    u.role === "academic-director" ||
    u.role === "campus-admin"
  ) {
    return null;
  }
  const out = new Set<string>();
  if (u.subjectIds && u.subjectIds.length > 0) {
    for (const id of u.subjectIds) out.add(id);
    return out;
  }
  if (u.subject) {
    // Legacy: `subject` là chữ tự do đã trôi khỏi tên chuẩn trong kho môn
    // (seed ghi "Văn" trong khi kho ghi "Ngữ văn"). Khớp ba bậc — đúng hệt,
    // theo mã, rồi chứa nhau — để hồ sơ cũ vẫn có phạm vi, admin không phải
    // sửa lại từng người.
    const needle = u.subject.toLowerCase().trim();
    const match =
      subjects.find((s) => s.name.toLowerCase() === needle) ||
      subjects.find((s) => s.code?.toLowerCase() === needle) ||
      subjects.find(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          needle.includes(s.name.toLowerCase()),
      );
    if (match) out.add(match.id);
  }
  return out;
}

/** Người này có phụ trách môn đó không. `null` (không giới hạn) = có. */
export function userTeachesSubject(
  u: { role?: string; subjectIds?: string[]; subject?: string } | null | undefined,
  subjectId: string | null | undefined,
  subjects: { id: string; name: string; code?: string }[],
): boolean {
  const ids = subjectIdsOfUser(u, subjects);
  if (ids == null) return true;
  if (!subjectId) return false;
  return ids.has(subjectId);
}

/**
 * Phạm vi rút gọn cho hai hàm lọc dưới đây.
 *
 * Khai lại ở đây thay vì import `UserScope` từ `use-scope.ts` để module này
 * KHÔNG kéo React vào — đó là toàn bộ lý do nó tồn tại (xem đầu file).
 */
export interface ScopeLike {
  allowedSubjectIds: Set<string> | null;
  allowedGradeIds: Set<string> | null;
  isUnscoped: boolean;
}

/**
 * Lọc danh sách MÔN cho ô chọn / ô lọc.
 *
 * ⚠️ Danh sách dữ liệu cắt đúng KHÔNG có nghĩa là xong. Ô chọn là một đường
 * rò riêng: /admin/question-bank từng cắt đúng danh sách câu hỏi nhưng ô lọc
 * vẫn liệt kê mọi môn của cơ sở, nên TBM Toán vẫn thấy "Sinh học". Cắt cả hai.
 */
export function filterSubjectsByScope<T extends { id: string }>(
  items: T[],
  scope: ScopeLike,
): T[] {
  if (scope.isUnscoped || !scope.allowedSubjectIds) return items;
  const ids = scope.allowedSubjectIds;
  return items.filter((it) => ids.has(it.id));
}

/**
 * Lọc danh sách KHỐI cho ô chọn / ô lọc.
 *
 * `allowedGradeIds == null` trả về NGUYÊN danh sách — đúng quy ước "không
 * giao khối nào = mọi khối trong môn được giao". Siết chỗ này là giáo viên
 * chưa gán khối mất sạch ô chọn.
 */
export function filterGradesByScope<T extends { id: string }>(
  items: T[],
  scope: ScopeLike,
): T[] {
  if (scope.isUnscoped || scope.allowedGradeIds == null) return items;
  const ids = scope.allowedGradeIds;
  return items.filter((it) => ids.has(it.id));
}
