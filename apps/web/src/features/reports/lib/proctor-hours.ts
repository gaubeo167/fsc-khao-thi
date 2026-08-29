/**
 * Giờ coi thi theo giáo viên.
 *
 * ── Vì sao có ───────────────────────────────────────────────────────────
 *
 * Cuối kỳ nhà trường phải trả lời "thầy cô nào coi bao nhiêu ca, bao nhiêu
 * giờ" để tính công và chia ca kỳ sau cho đều. Dữ liệu vốn đã nằm sẵn trong
 * ca thi (`rooms[].proctorIds` + `startAt`/`endAt`), nhưng chưa chỗ nào cộng
 * lại — tổ văn phòng đang mở từng ca ra đếm tay.
 *
 * ── Hai chỗ dễ đếm sai ──────────────────────────────────────────────────
 *
 * 1. MỘT giáo viên coi HAI phòng của cùng một ca vẫn chỉ là MỘT ca, một
 *    khoảng thời gian. Cộng theo phòng là thổi phồng công của đúng những
 *    người bị xếp nhiều phòng nhất — sai thành có lợi cho người sai.
 *
 * 2. Ca ĐÃ HUỶ không tính. Không ai tới coi cả. Ca nháp cũng vậy: chưa xếp
 *    xong thì chưa phải việc đã làm.
 *
 * Đây là số liệu đi vào bảng công, nên thà thiếu còn hơn thừa: ca thiếu mốc
 * thời gian hoặc mốc lệch (kết thúc trước lúc bắt đầu) được đếm là MỘT ca
 * nhưng 0 phút, và báo riêng ở `caThieuGio` để người xem còn biết mà sửa —
 * chứ không lặng lẽ bỏ ca đó khỏi bảng.
 */

/** Chỉ cần ngần này để tính — hợp với cả ca thi thật lẫn dữ liệu test. */
export interface ProctorShiftLike {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  subjectId?: string;
  gradeId?: string;
  rooms?: { proctorIds?: string[] }[];
}

/** Một ca mà giáo viên này đã coi. */
export interface ProctorShiftRow {
  shiftId: string;
  shiftName: string;
  startAt: string;
  minutes: number;
  /** Ca thiếu mốc thời gian hoặc mốc lệch — tính 0 phút, cần người sửa. */
  moTaLoi: string | null;
}

/** Tổng của một giáo viên. */
export interface ProctorTotal {
  userId: string;
  name: string;
  soCa: number;
  soPhut: number;
  /** Số ca không tính được giờ — hiện riêng để đừng ai tưởng là coi 0 giờ. */
  caThieuGio: number;
  shifts: ProctorShiftRow[];
}

/**
 * Độ dài một ca, tính bằng phút. `null` nếu không tính được.
 *
 * Mốc lệch (kết thúc ≤ bắt đầu) trả `null` chứ KHÔNG trả số âm — số âm lọt
 * vào bảng công sẽ trừ mất giờ của ca khác, và trừ âm thầm.
 */
export function shiftMinutes(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
): number | null {
  if (!startAt || !endAt) return null;
  const a = new Date(startAt).getTime();
  const b = new Date(endAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b <= a) return null;
  return Math.round((b - a) / 60000);
}

/** Phút → "2h 30′" cho người đọc. */
export function formatHours(minutes: number): string {
  if (minutes <= 0) return "0′";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}′`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}′`;
}

/**
 * Cộng giờ coi thi theo từng giáo viên.
 *
 * `shifts` phải là danh sách ĐÃ LỌC theo cơ sở / môn / khối của người xem —
 * hàm này không tự cắt phạm vi, để chỗ gọi dùng lại đúng bộ lọc sẵn có thay
 * vì đẻ luật phân quyền thứ hai.
 *
 * `tenCuaId` tra tên hiển thị; không tra được thì giữ id để người xem còn
 * lần ra được là ai, chứ không hiện "—" rồi không biết hỏng ở đâu.
 */
export function tinhGioCoiThi(
  shifts: readonly ProctorShiftLike[],
  tenCuaId: (userId: string) => string | null,
): ProctorTotal[] {
  const theo = new Map<string, ProctorTotal>();

  for (const sh of shifts) {
    // MỘT giáo viên coi nhiều phòng của cùng ca vẫn là một ca — gom về tập
    // hợp TRƯỚC khi cộng, không cộng theo từng phòng.
    const nguoiCoi = new Set<string>();
    for (const room of sh.rooms ?? []) {
      for (const id of room?.proctorIds ?? []) if (id) nguoiCoi.add(id);
    }
    if (nguoiCoi.size === 0) continue;

    const phut = shiftMinutes(sh.startAt, sh.endAt);
    const moTaLoi =
      phut == null
        ? !sh.startAt || !sh.endAt
          ? "Ca thiếu mốc bắt đầu hoặc kết thúc"
          : "Giờ kết thúc không sau giờ bắt đầu"
        : null;

    for (const userId of nguoiCoi) {
      let t = theo.get(userId);
      if (!t) {
        t = {
          userId,
          name: tenCuaId(userId) ?? userId,
          soCa: 0,
          soPhut: 0,
          caThieuGio: 0,
          shifts: [],
        };
        theo.set(userId, t);
      }
      t.soCa += 1;
      t.soPhut += phut ?? 0;
      if (moTaLoi) t.caThieuGio += 1;
      t.shifts.push({
        shiftId: sh.id,
        shiftName: sh.name,
        startAt: sh.startAt,
        minutes: phut ?? 0,
        moTaLoi,
      });
    }
  }

  for (const t of theo.values()) {
    t.shifts.sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
    );
  }

  // Nhiều giờ nhất lên trước; bằng giờ thì nhiều ca hơn lên trước; bằng nốt
  // thì theo tên, để thứ tự không nhảy giữa các lần dựng lại.
  return [...theo.values()].sort(
    (a, b) =>
      b.soPhut - a.soPhut ||
      b.soCa - a.soCa ||
      a.name.localeCompare(b.name, "vi"),
  );
}
