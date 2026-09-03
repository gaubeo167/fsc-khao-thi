#!/usr/bin/env node
/**
 * Test hồi quy cho thống kê GIỜ COI THI theo giáo viên
 * (apps/web/src/features/reports/lib/proctor-hours.ts).
 *
 * Chạy:  node scripts/test-proctor-hours.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Số ở đây đi vào bảng công. Đếm sai không ai kêu ngay — nó chỉ hiện ra
 * thành thầy cô nhận thiếu giờ, hoặc kỳ sau bị xếp lệch ca. Hai chỗ dễ sai
 * và phải khoá cứng:
 *
 *   1. Một giáo viên coi HAI phòng của CÙNG một ca vẫn chỉ là MỘT ca. Cộng
 *      theo phòng là thổi phồng công của đúng người bị xếp nhiều phòng nhất.
 *   2. Mốc thời gian lệch (kết thúc trước bắt đầu) KHÔNG được ra số âm — số
 *      âm lọt vào bảng sẽ trừ mất giờ của ca khác, và trừ âm thầm.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-proctor-")), "p.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/reports/lib/proctor-hours.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { tinhGioCoiThi, shiftMinutes, formatHours, ngayLocal, locCaTheoNgay, nhanNgayThi } =
  await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const TEN = { t1: "Cô Lan", t2: "Thầy Bình", t3: "Cô Mai" };
const ten = (id) => TEN[id] ?? null;
const ca = (id, name, start, end, phongs) => ({
  id, name, startAt: start, endAt: end,
  rooms: phongs.map((ids) => ({ proctorIds: ids })),
});

/* ── 1. Độ dài một ca ────────────────────────────────────────────────── */
{
  check("90 phút", shiftMinutes("2026-05-01T08:00:00Z", "2026-05-01T09:30:00Z") === 90);
  check("thiếu mốc bắt đầu → null", shiftMinutes(null, "2026-05-01T09:00:00Z") === null);
  check("thiếu mốc kết thúc → null", shiftMinutes("2026-05-01T08:00:00Z", "") === null);
  check("mốc không đọc được → null", shiftMinutes("hôm qua", "hôm nay") === null);
  check(
    "kết thúc TRƯỚC bắt đầu → null, KHÔNG ra số âm",
    shiftMinutes("2026-05-01T09:00:00Z", "2026-05-01T08:00:00Z") === null,
  );
  check("dài bằng 0 → null", shiftMinutes("2026-05-01T08:00:00Z", "2026-05-01T08:00:00Z") === null);
}

/* ── 2. Hiện cho người đọc ───────────────────────────────────────────── */
{
  check("90 → '1h 30′'", formatHours(90) === "1h 30′", formatHours(90));
  check("120 → '2h'", formatHours(120) === "2h", formatHours(120));
  check("45 → '45′'", formatHours(45) === "45′", formatHours(45));
  check("0 → '0′'", formatHours(0) === "0′");
  check("số âm cũng ra '0′', không in dấu trừ", formatHours(-30) === "0′", formatHours(-30));
}

/* ── 3. MỘT ca, HAI phòng, CÙNG một người → vẫn là một ca ────────────── */
// Đây là chỗ dễ sai nhất và sai theo hướng có lợi cho người bị xếp nhiều phòng.
{
  const r = tinhGioCoiThi(
    [ca("s1", "Ca 1", "2026-05-01T08:00:00Z", "2026-05-01T09:30:00Z", [["t1"], ["t1"]])],
    ten,
  );
  check("chỉ ra MỘT dòng", r.length === 1, JSON.stringify(r.map((x) => x.userId)));
  check("đếm 1 ca, không phải 2", r[0].soCa === 1, String(r[0].soCa));
  check("cộng 90 phút, không phải 180", r[0].soPhut === 90, String(r[0].soPhut));
  check("danh sách ca cũng chỉ có 1 dòng", r[0].shifts.length === 1);
}

/* ── 4. Cộng dồn nhiều ca, nhiều người ───────────────────────────────── */
{
  const r = tinhGioCoiThi(
    [
      ca("s1", "Ca 1", "2026-05-01T08:00:00Z", "2026-05-01T09:30:00Z", [["t1", "t2"]]),
      ca("s2", "Ca 2", "2026-05-02T08:00:00Z", "2026-05-02T10:00:00Z", [["t1"]]),
      ca("s3", "Ca 3", "2026-05-03T08:00:00Z", "2026-05-03T08:45:00Z", [["t3"]]),
    ],
    ten,
  );
  const byId = Object.fromEntries(r.map((x) => [x.userId, x]));
  check("cô Lan: 2 ca · 210 phút", byId.t1.soCa === 2 && byId.t1.soPhut === 210, JSON.stringify(byId.t1));
  check("thầy Bình: 1 ca · 90 phút", byId.t2.soCa === 1 && byId.t2.soPhut === 90);
  check("cô Mai: 1 ca · 45 phút", byId.t3.soCa === 1 && byId.t3.soPhut === 45);
  check("xếp theo giờ giảm dần", r[0].userId === "t1" && r[2].userId === "t3", r.map((x) => x.userId).join(","));
  check("ca mới nhất lên đầu trong danh sách của một người", byId.t1.shifts[0].shiftId === "s2");
  check("tra được tên", byId.t1.name === "Cô Lan");
}

/* ── 5. Ca lệch mốc: tính 1 ca, 0 phút, và BÁO ra ────────────────────── */
// Bỏ hẳn ca đó khỏi bảng là giấu lỗi dữ liệu; cộng số âm là hỏng bảng công.
{
  const r = tinhGioCoiThi(
    [
      ca("s1", "Ca tốt", "2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z", [["t1"]]),
      ca("s2", "Ca lệch", "2026-05-02T09:00:00Z", "2026-05-02T08:00:00Z", [["t1"]]),
      ca("s3", "Ca thiếu mốc", "", "", [["t1"]]),
    ],
    ten,
  );
  check("vẫn đếm đủ 3 ca", r[0].soCa === 3, String(r[0].soCa));
  check("chỉ cộng 60 phút của ca tốt", r[0].soPhut === 60, String(r[0].soPhut));
  check("báo 2 ca không tính được giờ", r[0].caThieuGio === 2, String(r[0].caThieuGio));
  const lech = r[0].shifts.find((s) => s.shiftId === "s2");
  check("nói rõ vì sao ca lệch", /không sau/.test(lech.moTaLoi ?? ""), String(lech.moTaLoi));
  const thieu = r[0].shifts.find((s) => s.shiftId === "s3");
  check("nói rõ vì sao ca thiếu mốc", /thiếu mốc/.test(thieu.moTaLoi ?? ""), String(thieu.moTaLoi));
}

/* ── 6. Không có giám thị thì không sinh dòng nào ────────────────────── */
{
  check("ca không có phòng → bảng rỗng", tinhGioCoiThi([ca("s1", "C", "2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z", [])], ten).length === 0);
  check("phòng không có giám thị → bảng rỗng", tinhGioCoiThi([ca("s1", "C", "2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z", [[]])], ten).length === 0);
  check("thiếu hẳn `rooms` → không nổ", tinhGioCoiThi([{ id: "s1", name: "C", startAt: "2026-05-01T08:00:00Z", endAt: "2026-05-01T09:00:00Z" }], ten).length === 0);
  check("danh sách rỗng → bảng rỗng", tinhGioCoiThi([], ten).length === 0);
}

/* ── 7. Không tra được tên thì GIỮ id ────────────────────────────────── */
// Hiện "—" là người xem không lần ra được ai, và không biết là dữ liệu hỏng.
{
  const r = tinhGioCoiThi([ca("s1", "C", "2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z", [["u-la-mat"]])], ten);
  check("giữ id khi không có tên", r[0].name === "u-la-mat", r[0].name);
}

/* ── 8. Ngày thi: cột mới + lọc theo khoảng ──────────────────────────── */
//
// Bảng công tính theo ĐỢT ("tháng 5", "kỳ I"), không tính gộp cả năm. Không
// có vế này thì tổ văn phòng phải tự trừ tay ra khỏi tổng cả năm — và trừ
// tay thì sai.
{
  /* 8a. Mốc ISO → ngày ĐỊA PHƯƠNG, không phải cắt chuỗi. */
  check("mốc ISO → ngày địa phương", ngayLocal("2026-05-01T08:00:00+07:00") === "2026-05-01", String(ngayLocal("2026-05-01T08:00:00+07:00")));
  check("mốc rỗng → null", ngayLocal("") === null);
  check("mốc không đọc được → null", ngayLocal("hôm qua") === null);
  check("null → null", ngayLocal(null) === null);
  check(
    "đọc qua Date chứ KHÔNG cắt chuỗi ISO (cắt là trượt ca thi sáng sớm)",
    ngayLocal("2026-05-01T23:30:00-05:00") === "2026-05-02",
    String(ngayLocal("2026-05-01T23:30:00-05:00")),
  );

  /* 8b. Cột "Ngày thi" hiện ra sao. */
  check("một ngày duy nhất → ghi đủ ngày", nhanNgayThi("2026-05-01", "2026-05-01") === "01/05/2026", nhanNgayThi("2026-05-01", "2026-05-01"));
  check(
    "khoảng cùng năm → bỏ năm ở đầu cho đỡ chật",
    nhanNgayThi("2026-05-01", "2026-05-20") === "01/05 → 20/05/2026",
    nhanNgayThi("2026-05-01", "2026-05-20"),
  );
  check(
    "khoảng KHÁC năm → ghi đủ cả hai (28/12 → 03/01 là đọc nhầm được)",
    nhanNgayThi("2025-12-28", "2026-01-03") === "28/12/2025 → 03/01/2026",
    nhanNgayThi("2025-12-28", "2026-01-03"),
  );
  check("không có ngày nào → '—'", nhanNgayThi(null, null) === "—");
  check("thiếu một đầu → '—'", nhanNgayThi("2026-05-01", null) === "—");

  /* 8c. Mốc ngày đi kèm mỗi giáo viên. */
  const r = tinhGioCoiThi(
    [
      ca("s1", "Ca 1", "2026-05-01T08:00:00+07:00", "2026-05-01T09:30:00+07:00", [["t1"]]),
      ca("s3", "Ca 3", "2026-05-20T08:00:00+07:00", "2026-05-20T09:00:00+07:00", [["t1"]]),
      ca("s2", "Ca 2", "2026-05-10T08:00:00+07:00", "2026-05-10T09:00:00+07:00", [["t1"]]),
    ],
    ten,
  );
  check("ngày đầu là ca SỚM nhất", r[0].ngayDau === ngayLocal("2026-05-01T08:00:00+07:00"), String(r[0].ngayDau));
  check("ngày cuối là ca MUỘN nhất", r[0].ngayCuoi === ngayLocal("2026-05-20T08:00:00+07:00"), String(r[0].ngayCuoi));
  check("ngày đầu KHÔNG sau ngày cuối", r[0].ngayDau <= r[0].ngayCuoi);

  /* 8d. MỘT ca hỏng mốc KHÔNG được xoá ngày của những ca lành. */
  // Đây là chỗ dễ hỏng nhất: hàm so cũ trừ hai `getTime()`, mốc hỏng ra NaN,
  // mà hàm so mâu thuẫn thì `sort` được phép xáo cả mảng — kể cả dòng lành.
  const lan = tinhGioCoiThi(
    [
      ca("s1", "Ca lành", "2026-05-01T08:00:00+07:00", "2026-05-01T09:00:00+07:00", [["t1"]]),
      ca("s2", "Ca hỏng mốc", "", "", [["t1"]]),
      ca("s3", "Ca lành 2", "2026-05-09T08:00:00+07:00", "2026-05-09T09:00:00+07:00", [["t1"]]),
    ],
    ten,
  );
  check("vẫn ra khoảng ngày dù có ca hỏng mốc", lan[0].ngayDau != null && lan[0].ngayCuoi != null, JSON.stringify([lan[0].ngayDau, lan[0].ngayCuoi]));
  check("ngày đầu vẫn đúng ca sớm nhất", lan[0].ngayDau === ngayLocal("2026-05-01T08:00:00+07:00"), String(lan[0].ngayDau));
  check("ngày cuối vẫn đúng ca muộn nhất", lan[0].ngayCuoi === ngayLocal("2026-05-09T08:00:00+07:00"), String(lan[0].ngayCuoi));
  check("ca hỏng mốc bị đẩy xuống CUỐI danh sách", lan[0].shifts[2].shiftId === "s2", lan[0].shifts.map((x) => x.shiftId).join(","));
  check("ca lành vẫn xếp mới→cũ", lan[0].shifts[0].shiftId === "s3" && lan[0].shifts[1].shiftId === "s1", lan[0].shifts.map((x) => x.shiftId).join(","));
  check("không có ca nào đọc được mốc → hai đầu đều null", tinhGioCoiThi([ca("s1", "C", "", "", [["t1"]])], ten)[0].ngayDau === null);

  /* 8e. Lọc theo khoảng ngày. */
  const dsCa = [
    { id: "a", startAt: "2026-05-01T08:00:00+07:00" },
    { id: "b", startAt: "2026-05-10T08:00:00+07:00" },
    { id: "c", startAt: "2026-05-20T08:00:00+07:00" },
    { id: "hong", startAt: "" },
  ];
  const ids = (xs) => xs.map((x) => x.id).join(",");
  check("không đặt khoảng → giữ nguyên tất cả", ids(locCaTheoNgay(dsCa)) === "a,b,c,hong");
  check("chỉ đặt 'từ ngày'", ids(locCaTheoNgay(dsCa, "2026-05-10", "")) === "b,c,hong", ids(locCaTheoNgay(dsCa, "2026-05-10", "")));
  check("chỉ đặt 'đến ngày'", ids(locCaTheoNgay(dsCa, "", "2026-05-10")) === "a,b,hong", ids(locCaTheoNgay(dsCa, "", "2026-05-10")));
  check("đặt cả hai đầu", ids(locCaTheoNgay(dsCa, "2026-05-05", "2026-05-15")) === "b,hong", ids(locCaTheoNgay(dsCa, "2026-05-05", "2026-05-15")));
  check(
    "hai đầu là BAO GỒM, không hụt ngày biên",
    ids(locCaTheoNgay(dsCa, "2026-05-01", "2026-05-20")) === "a,b,c,hong",
    ids(locCaTheoNgay(dsCa, "2026-05-01", "2026-05-20")),
  );
  check(
    "một ngày duy nhất lấy đúng ca ngày đó",
    ids(locCaTheoNgay(dsCa, "2026-05-10", "2026-05-10")) === "b,hong",
    ids(locCaTheoNgay(dsCa, "2026-05-10", "2026-05-10")),
  );
  // Ca hỏng mốc là đúng thứ bảng này đang bảo người xem đi sửa. Lọc mất nó
  // là giấu, mà giấu thì không ai đi sửa nữa.
  check("ca hỏng mốc LUÔN được giữ, kể cả khi có lọc", locCaTheoNgay(dsCa, "2026-05-05", "2026-05-06").some((x) => x.id === "hong"));
  check("khoảng không có ca nào → chỉ còn ca hỏng mốc", ids(locCaTheoNgay(dsCa, "2027-01-01", "2027-01-02")) === "hong");
  check("lọc trả về MẢNG MỚI, không sửa mảng gốc", locCaTheoNgay(dsCa) !== dsCa && dsCa.length === 4);
  check("null cũng là 'không lọc'", ids(locCaTheoNgay(dsCa, null, null)) === "a,b,c,hong");
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
