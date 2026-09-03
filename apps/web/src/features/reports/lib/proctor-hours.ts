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
  /**
   * Ngày thi sớm nhất / muộn nhất TRONG KHOẢNG ĐANG XEM (ISO), `null` khi
   * không ca nào của người này có mốc đọc được.
   *
   * Có để bảng tổng hợp hiện được cột "Ngày thi" mà không phải mở từng người
   * ra xem. Trước đây ngày chỉ nằm trong phần bung ra, nên tổ văn phòng muốn
   * biết "tháng này ai coi bao nhiêu" là phải bấm mở từng dòng một.
   */
  ngayDau: string | null;
  ngayCuoi: string | null;
  shifts: ProctorShiftRow[];
}

/**
 * Mốc ISO → `YYYY-MM-DD` theo GIỜ ĐỊA PHƯƠNG.
 *
 * Cắt chuỗi ISO (`.slice(0, 10)`) là sai: ca 08:00 giờ Việt Nam lưu thành
 * `…T01:00:00Z`, cắt ra vẫn ra đúng ngày, nhưng ca 07:00 sáng lưu thành
 * `…T00:00:00Z` của NGÀY HÔM TRƯỚC — lọc theo ngày sẽ trượt mất đúng những
 * ca thi buổi sáng sớm.
 */
export function ngayLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Cắt danh sách ca theo khoảng NGÀY THI (`YYYY-MM-DD`, bao gồm cả hai đầu).
 *
 * Ca THIẾU mốc thời gian được GIỮ LẠI dù có lọc hay không. Đó chính là những
 * ca bảng này đang bảo người xem đi sửa; lọc mất chúng là giấu đúng thứ cần
 * hiện, mà giấu thì không ai đi sửa nữa.
 */
export function locCaTheoNgay<T extends { startAt: string }>(
  shifts: readonly T[],
  tuNgay?: string | null,
  denNgay?: string | null,
): T[] {
  const tu = tuNgay || null;
  const den = denNgay || null;
  if (!tu && !den) return [...shifts];
  return shifts.filter((sh) => {
    const ngay = ngayLocal(sh.startAt);
    if (ngay == null) return true; // ca hỏng mốc — luôn giữ để còn thấy mà sửa
    if (tu && ngay < tu) return false;
    if (den && ngay > den) return false;
    return true;
  });
}

/** `2026-05-01` → `01/05/2026`. */
function ddmmyyyy(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Cột "Ngày thi" của một giáo viên: một ngày, hay một khoảng.
 *
 * Cùng năm thì bỏ năm ở đầu khoảng (`01/05 → 20/05/2026`) cho đỡ chật; khác
 * năm thì ghi đủ, vì `28/12 → 03/01/2026` là đọc nhầm được.
 */
export function nhanNgayThi(
  ngayDau: string | null,
  ngayCuoi: string | null,
): string {
  if (!ngayDau || !ngayCuoi) return "—";
  const a = ddmmyyyy(ngayDau);
  const b = ddmmyyyy(ngayCuoi);
  if (a === b) return a;
  const cungNam = a.slice(-4) === b.slice(-4);
  return `${cungNam ? a.slice(0, 5) : a} → ${b}`;
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
          ngayDau: null,
          ngayCuoi: null,
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
    // Ca mới nhất lên đầu; ca KHÔNG đọc được mốc xuống cuối.
    //
    // Trước đây so bằng hiệu hai `getTime()`: mốc hỏng ra `NaN`, mà `NaN` thì
    // mọi phép so đều false — hàm so trở nên mâu thuẫn và `sort` được phép
    // xáo cả mảng, kể cả những dòng lành. Chuyển sang so hạng tường minh.
    const moc = (x: string) => {
      const ms = new Date(x).getTime();
      return Number.isFinite(ms) ? ms : null;
    };
    t.shifts.sort((a, b) => {
      const x = moc(a.startAt);
      const y = moc(b.startAt);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return y - x;
    });
    // Mốc ngày lấy từ ca ĐỌC ĐƯỢC mốc. Ca hỏng mốc vẫn nằm trong danh sách và
    // vẫn đếm là một lượt, nhưng không được kéo cột "Ngày thi" về `null` —
    // một ca hỏng không được xoá ngày của mười ca lành.
    const ngay = t.shifts
      .map((s) => ngayLocal(s.startAt))
      .filter((x): x is string => x != null)
      .sort();
    t.ngayDau = ngay[0] ?? null;
    t.ngayCuoi = ngay[ngay.length - 1] ?? null;
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
