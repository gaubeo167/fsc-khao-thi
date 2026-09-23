/**
 * "Lớp này gồm những học sinh nào" — một luật, dùng chung.
 *
 * Hồ sơ /users trong hệ thống đã đi qua ba hình dạng và cả ba còn sống:
 *
 *   a) `classIds: string[]` — hình dạng hiện tại.
 *   b) `className: string`  — bản cũ, một lớp duy nhất, khớp theo TÊN hoặc MÃ
 *      lớp ("1A", "10A1").
 *   c) Bản ghi LỚP mang sẵn `studentIds: string[]` — dữ liệu mẫu đời đầu.
 *
 * Danh sách trả về là HỢP của cả ba, nên hồ sơ cũ không lặng lẽ biến mất khỏi
 * lớp. Đây chính là chỗ đã sinh ra lỗi "giao bài cho lớp mà nửa lớp không
 * thấy bài", nên đừng rút gọn xuống chỉ còn `classIds`.
 */

export interface RosterStudent {
  id: string;
  name: string;
  /** Mã học sinh hoặc tên đăng nhập — để phân biệt hai bạn trùng tên. */
  code?: string;
}

interface ClassLike {
  id: string;
  name: string;
  code?: string;
  studentIds?: string[];
}

interface UserLike {
  id: string;
  name: string;
  role: string;
  classIds?: string[];
  className?: string | null;
  studentCode?: string | null;
  username?: string | null;
}

/** Học sinh của MỘT lớp, sắp theo tên tiếng Việt. */
export function studentsOfClass(
  cls: ClassLike,
  users: readonly UserLike[],
): RosterStudent[] {
  const ids = new Set<string>(cls.studentIds ?? []);
  const targetNames = [cls.name?.toLowerCase(), cls.code?.toLowerCase()].filter(
    (x): x is string => Boolean(x),
  );
  for (const u of users) {
    if (u.role !== "student") continue;
    const byClassIds = u.classIds?.includes(cls.id) ?? false;
    const byClassName =
      u.className != null && targetNames.includes(u.className.toLowerCase());
    if (byClassIds || byClassName) ids.add(u.id);
  }
  return [...ids]
    .map((sid) => users.find((u) => u.id === sid))
    .filter((u): u is UserLike => Boolean(u))
    .map((u) => ({
      id: u.id,
      name: u.name,
      code: u.studentCode ?? u.username ?? undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
}

/** Danh sách học sinh của nhiều lớp, giữ nguyên thứ tự lớp được chọn. */
export function rosterForClasses(
  classIds: readonly string[],
  classes: readonly ClassLike[],
  users: readonly UserLike[],
): Array<{ classId: string; className: string; students: RosterStudent[] }> {
  const out: Array<{ classId: string; className: string; students: RosterStudent[] }> = [];
  for (const cid of classIds) {
    const cls = classes.find((c) => c.id === cid);
    if (!cls) continue;
    out.push({ classId: cid, className: cls.name, students: studentsOfClass(cls, users) });
  }
  return out;
}
