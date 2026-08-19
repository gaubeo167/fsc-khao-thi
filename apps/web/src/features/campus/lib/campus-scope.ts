/**
 * MỘT luật duy nhất cho "cơ sở đang thao tác thấy được môn nào, khối nào".
 *
 * ── Vì sao tách ra ──────────────────────────────────────────────────────
 *
 * Luật này đã được chép tay ở nhiều màn, và bản chép ở hộp thoại "Tải đề lên"
 * thì thiếu hẳn: ô chọn Môn/Khối ở đó đọc THẲNG từ store, không lọc campus,
 * trong khi bộ lọc của chính trang Ngân hàng câu hỏi ngay bên ngoài thì có.
 *
 * Hậu quả không phải là "hiện thừa vài dòng". Hai cơ sở có thể cùng có một
 * môn tên "Sinh học" nhưng là HAI bản ghi khác nhau. Danh sách không lọc hiện
 * cả hai với CÙNG một cái tên, người dùng chọn nhầm bản của cơ sở khác mà
 * không có cách nào nhận ra. Từ lúc đó:
 *
 *   · khung YCCĐ dựng theo `subjectId` vừa chọn → thiếu đúng những mã mà
 *     người dùng đang nhìn thấy ở màn Khung YCCĐ (vì màn đó chọn bản kia),
 *     nên đề trích dẫn mã có thật lại báo "khung không có mã đó";
 *   · cả đề được cất vào môn của cơ sở khác.
 *
 * Cả hai đều im lặng. Nên luật về ở đây, và mọi ô chọn Môn/Khối phải đi qua.
 */

export interface ScopedCampus {
  id: string;
  gradeIds: string[];
}

export interface ScopedSubject {
  id: string;
  gradeIds: string[];
  campusIds?: string[] | null;
}

/**
 * Cơ sở đang thao tác.
 *
 * `superadmin` không gắn cơ sở nên đi theo cơ sở đang chọn trên thanh trên;
 * các vai khác luôn là cơ sở của chính họ. `null` = chưa xác định được, và
 * lúc đó KHÔNG lọc — thà hiện đủ còn hơn hiện rỗng và làm người dùng tưởng
 * chưa có dữ liệu.
 */
export function operatingCampusId(
  role: string | null | undefined,
  sessionCampusId: string | null | undefined,
  activeCampusId: string | null | undefined,
): string | null {
  if (role === "superadmin") return activeCampusId ?? null;
  return sessionCampusId ?? null;
}

/**
 * Môn mà cơ sở này dạy.
 *
 * `campusIds` rỗng/thiếu = môn dùng chung mọi cơ sở (quy ước có sẵn của dữ
 * liệu môn học). Ngoài ra còn đòi môn phải có ít nhất một khối trùng với khối
 * cơ sở đang mở — môn cấp 3 không việc gì hiện ở một cơ sở chỉ có cấp 2.
 */
export function subjectsInCampus<T extends ScopedSubject>(
  subjects: T[],
  campus: ScopedCampus | null,
): T[] {
  if (!campus) return subjects;
  return subjects.filter((s) => {
    const inCampus =
      !s.campusIds || s.campusIds.length === 0 || s.campusIds.includes(campus.id);
    if (!inCampus) return false;
    return s.gradeIds.some((gid) => campus.gradeIds.includes(gid));
  });
}

/** Khối mà cơ sở này có. */
export function gradesInCampus<T extends { id: string }>(
  grades: T[],
  campus: ScopedCampus | null,
): T[] {
  if (!campus) return grades;
  const ids = new Set(campus.gradeIds);
  return grades.filter((g) => ids.has(g.id));
}
