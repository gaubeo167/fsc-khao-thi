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
