#!/usr/bin/env node
/**
 * Test hồi quy: ai được ẨN / HIỆN ca thi
 * (apps/web/src/features/exam-shifts/lib/hide-permission.ts).
 *
 * Chạy:  node scripts/test-hide-shift.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Ẩn, huỷ và xoá từng bị gộp làm một trong giao diện: nút duy nhất làm ca
 * biến khỏi danh sách là nút thùng rác, mà nó tự chặn khi ca đã có bài làm.
 * Ca đã kết thúc thì LUÔN có bài làm — nên không ai ẩn được, kể cả admin gốc,
 * và danh sách vận hành cứ dài mãi.
 *
 * Hai phía phải khoá cứng:
 *   • Nới ra  → giáo viên ẩn ca của người khác, hoặc ẩn ca CHƯA THI và giấu
 *               mất lịch thi khỏi chính người phải chuẩn bị cho nó.
 *   • Siết vào → quay lại đúng bế tắc cũ.
 *
 * Và ẩn KHÔNG được đụng dữ liệu: đây chỉ là chuyện hiển thị của màn vận hành.
 *
 * ── Ẩn phải ăn sang màn Báo cáo ─────────────────────────────────────────
 *
 * Ẩn ca ở danh sách vận hành mà báo cáo của nó vẫn nằm nguyên trong "Kết quả
 * & Báo cáo" thì chưa dọn được gì: người dùng vẫn cuộn qua đúng những ca vừa
 * dọn đi. Nên `shiftsVisibleInReports` là luật CHUNG cho cả hai màn.
 *
 * Cái bẫy đi kèm: bảng "Giờ coi thi" tính công cho giáo viên cũng đọc từ tập
 * đó. Ẩn vài ca là tổng giờ tự hụt. Vậy nên trang phải ĐẾM được số ca đang ẩn
 * (`countHiddenShifts`) để nói ra và cho bật lại — hụt trong im lặng là hỏng.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-hide-")), "h.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/exam-shifts/lib/hide-permission.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  canHideShift,
  canUnhideShift,
  isCampusRoot,
  planBulkHide,
  canPublishResults,
  shiftsVisibleInReports,
  countHiddenShifts,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const CS = "campus-cg";
const gio = (h) => new Date(Date.parse("2026-05-01T00:00:00Z") + h * 3600e3).toISOString();
// Ca đã kết thúc: mốc nằm trong quá khứ sâu nên đồng hồ thật không đổi kết quả.
const daXong = { status: "scheduled", startAt: gio(-48), endAt: gio(-47), campusId: CS };
const daHuy = { status: "cancelled", startAt: gio(-48), endAt: gio(-47), campusId: CS };
const sapThi = { status: "scheduled", startAt: gio(24 * 365 * 50), endAt: gio(24 * 365 * 50 + 1), campusId: CS };
const nhap = { status: "draft", startAt: gio(-48), endAt: gio(-47), campusId: CS };

const ADMIN_GOC = { role: "superadmin", campusId: null };
const ADMIN_TRUONG = { role: "campus-admin", campusId: CS };
const ADMIN_KHAC = { role: "campus-admin", campusId: "campus-hai-phong" };
const TBM = { role: "subject-lead", campusId: CS };
const GV = { role: "teacher", campusId: CS };
const GD = { role: "academic-director", campusId: CS };

/* ── 1. Ai là bậc quản lý danh sách ──────────────────────────────────── */
{
  check("admin gốc → có", isCampusRoot(ADMIN_GOC, CS));
  check("admin trường ĐÚNG cơ sở → có", isCampusRoot(ADMIN_TRUONG, CS));
  check("admin trường cơ sở KHÁC → không", !isCampusRoot(ADMIN_KHAC, CS));
  check("Trưởng nhóm môn → không", !isCampusRoot(TBM, CS));
  check("giáo viên → không", !isCampusRoot(GV, CS));
  check("không đăng nhập → không", !isCampusRoot(null, CS));
}

/* ── 2. Ẩn: đúng người, đúng lúc ─────────────────────────────────────── */
{
  check("admin gốc ẩn ca ĐÃ KẾT THÚC", canHideShift(ADMIN_GOC, daXong).ok);
  check("admin trường ẩn ca đã kết thúc", canHideShift(ADMIN_TRUONG, daXong).ok);
  check("ca ĐÃ HUỶ cũng ẩn được", canHideShift(ADMIN_GOC, daHuy).ok);

  const gvThu = canHideShift(GV, daXong);
  check("giáo viên KHÔNG ẩn được", !gvThu.ok);
  check("…và lý do nói rõ ai mới được", /admin/i.test(gvThu.reason), gvThu.reason);

  const tbmThu = canHideShift(TBM, daXong);
  check("Trưởng nhóm môn KHÔNG ẩn được", !tbmThu.ok);

  check("admin cơ sở KHÁC không ẩn được", !canHideShift(ADMIN_KHAC, daXong).ok);
  // Giám đốc học vụ CỐ Ý không có quyền này — cùng bậc với whyDeleteBlocked
  // trong màn ca thi. Đổi ý thì sửa cả hai chỗ một lượt.
  check("giám đốc học vụ KHÔNG ẩn được (cùng bậc whyDeleteBlocked)", !canHideShift(GD, daXong).ok);
}

/* ── 3. Ca CHƯA kết thúc thì cấm ─────────────────────────────────────── */
// Ẩn ca sắp thi là giấu mất lịch thi khỏi người phải chuẩn bị cho nó.
{
  const v = canHideShift(ADMIN_GOC, sapThi);
  check("ca SẮP THI không ẩn được, kể cả admin gốc", !v.ok);
  check("…lý do nói về ca đã kết thúc", /kết thúc/i.test(v.reason), v.reason);
  check("ca NHÁP không ẩn được", !canHideShift(ADMIN_GOC, nhap).ok);
  check("ca không tồn tại → không, không nổ", !canHideShift(ADMIN_GOC, null).ok);
}

/* ── 3b. ĐÃ ẨN rồi thì không ẩn nữa ──────────────────────────────────── */
// Chỗ gọi dùng chính hàm này để quyết vẽ ô tích và nút Ẩn hay không. Thiếu vế
// này là dòng đã ẩn vẫn mời người dùng ẩn lần nữa, bấm xong ra "Ẩn 0 ca" —
// đúng lỗi /qa bắt được sau khi tính năng đã lên production.
{
  const daAn = { ...daXong, archivedAt: gio(-1) };
  const v = canHideShift(ADMIN_GOC, daAn);
  check("ca ĐÃ ẨN → không ẩn được nữa", !v.ok);
  check("…lý do nói đã ẩn từ trước", /đã ẩn/i.test(v.reason), v.reason);
  check("…nhưng HIỆN LẠI thì được", canUnhideShift(ADMIN_GOC, daAn).ok);
}

/* ── 4. Hiện lại: cùng bậc quyền, không cần điều kiện trạng thái ─────── */
{
  check("admin gốc hiện lại được", canUnhideShift(ADMIN_GOC, { ...daXong, archivedAt: gio(-1) }).ok);
  check("hiện lại KHÔNG đòi ca phải kết thúc", canUnhideShift(ADMIN_TRUONG, { ...sapThi, archivedAt: gio(-1) }).ok);
  check("giáo viên không hiện lại được", !canUnhideShift(GV, { ...daXong, archivedAt: gio(-1) }).ok);
}

/* ── 5. Ẩn hàng loạt: nói rõ cái nào bị bỏ qua ───────────────────────── */
// Lặng lẽ ẩn 7 trong 10 ca người dùng đã tích là mất niềm tin vào cả nút.
{
  const rows = [
    { id: "a", ...daXong },
    { id: "b", ...daHuy },
    { id: "c", ...sapThi },
    { id: "d", ...daXong, archivedAt: gio(-1) },
  ];
  const p = planBulkHide(ADMIN_GOC, rows);
  check("ẩn đúng 2 ca hợp lệ", p.hide.length === 2 && p.hide.map((s) => s.id).join() === "a,b", JSON.stringify(p.hide.map((s) => s.id)));
  check("bỏ qua 2 ca", p.skip.length === 2);
  check("nói ca sắp thi bị bỏ vì chưa kết thúc", /kết thúc/i.test(p.skip.find((s) => s.shift.id === "c").reason));
  check("nói ca đã ẩn rồi", /đã ẩn/i.test(p.skip.find((s) => s.shift.id === "d").reason));

  const gvPlan = planBulkHide(GV, rows);
  check("giáo viên: không ẩn được cái nào", gvPlan.hide.length === 0);
  check("…và mọi ca đều có lý do", gvPlan.skip.length === rows.length);

  check("danh sách rỗng → không nổ", planBulkHide(ADMIN_GOC, []).hide.length === 0);
}

/* ── 6. Ẩn ca → báo cáo của ca đó cũng biến mất ──────────────────────── */
{
  const rows = [
    { id: "a", ...daXong },
    { id: "b", ...daHuy },
    { id: "c", ...daXong, archivedAt: gio(-1) },
    { id: "d", ...daHuy, archivedAt: gio(-2) },
  ];

  const hien = shiftsVisibleInReports(rows);
  check(
    "báo cáo chỉ còn ca CHƯA ẩn",
    hien.map((s) => s.id).join() === "a,b",
    JSON.stringify(hien.map((s) => s.id)),
  );
  check("đếm đúng số ca đang ẩn", countHiddenShifts(rows) === 2);

  // Bảng giờ coi thi tính công — hụt giờ mà không nói là hỏng niềm tin.
  // Trang phải bật lại được để đối chiếu.
  const caBat = shiftsVisibleInReports(rows, { includeHidden: true });
  check("bật 'tính cả ca đã ẩn' → đủ 4 ca", caBat.length === 4);

  // `archivedAt: null` là ca ĐANG hiện, không phải ca ẩn. Firestore trả về
  // null chứ không bỏ trắng trường, nên nhầm chỗ này là giấu sạch báo cáo.
  const nullRong = shiftsVisibleInReports([
    { id: "x", ...daXong, archivedAt: null },
    { id: "y", ...daXong },
  ]);
  check("archivedAt=null vẫn là ca đang hiện", nullRong.length === 2);
  check("archivedAt=null không bị đếm là ẩn", countHiddenShifts(nullRong) === 0);

  // Không được sửa mảng gốc — chỗ gọi là useMemo, đụng vào nguồn là hỏng.
  check("không đụng mảng đầu vào", rows.length === 4);
  check("danh sách rỗng → không nổ", shiftsVisibleInReports([]).length === 0);
}

/* ── 7. Dây nối trong trang báo cáo ──────────────────────────────────────
 *
 * Hàm lọc đúng mà trang quên gọi thì người dùng vẫn thấy y như cũ. Ba chỗ
 * phải ăn cùng một tập ĐÃ LỌC: bảng ca thi, các con số tổng, và bảng giờ coi
 * thi (`ProctoringReport`).
 */
{
  const src = readFileSync(
    "apps/web/src/app/(authenticated)/reports/page.tsx",
    "utf8",
  );
  check("trang báo cáo gọi shiftsVisibleInReports", src.includes("shiftsVisibleInReports("));
  check("…và đếm số ca đang ẩn để nói ra", src.includes("countHiddenShifts("));
  check(
    "bảng giờ coi thi nhận tập ĐÃ lọc, không phải tập gốc",
    /<ProctoringReport\s+shifts=\{reportableShifts\}/.test(src),
  );
  check(
    "bảng ca thi + KPI tính từ tập đã lọc",
    /const summaries = useMemo\(\(\) => \{\s*return reportableShifts\.map/.test(src),
  );
}

/* ── 8. Công bố điểm / đổi trạng thái: PHẢI khớp firestore.rules ─────────
 *
 * Rules cho /shifts: `allow update: if isAdmin() || resource.data.ownerId == uid()`.
 * Giao diện rộng hơn rules là cái bẫy tệ nhất trong hệ này: kho đổi lạc quan
 * TRƯỚC, patchDoc nuốt lỗi, nên người dùng thấy hộp đóng như đã lưu còn máy
 * chủ không nhận gì. /qa đã bắt được đúng cảnh đó: TBM Toán bấm "Lưu công bố"
 * trên ca của admin → giao diện im lặng, máy chủ giữ nguyên giá trị cũ.
 */
{
  const caCuaAdmin = { ...daXong, ownerId: "u-admin" };
  const caCuaGV = { ...daXong, ownerId: "u-gv" };

  check("admin gốc công bố được", canPublishResults({ ...ADMIN_GOC, userId: "u-sa" }, caCuaAdmin).ok);
  check("admin trường công bố được", canPublishResults({ ...ADMIN_TRUONG, userId: "u-ad" }, caCuaAdmin).ok);
  check("CHỦ ca thi công bố được ca của mình", canPublishResults({ ...GV, userId: "u-gv" }, caCuaGV).ok);

  const tbmThu = canPublishResults({ ...TBM, userId: "u-tbm" }, caCuaAdmin);
  check("TBM KHÔNG công bố được ca của người khác", !tbmThu.ok);
  check("…lý do nói rõ ai mới được", /admin|người tạo/i.test(tbmThu.reason), tbmThu.reason);
  check("GV không phải chủ ca → không", !canPublishResults({ ...GV, userId: "u-gv-khac" }, caCuaAdmin).ok);
  check("admin cơ sở KHÁC → không", !canPublishResults({ ...ADMIN_KHAC, userId: "u-ad2" }, caCuaAdmin).ok);
  check("không đăng nhập → không", !canPublishResults(null, caCuaAdmin).ok);
  check("ca không tồn tại → không, không nổ", !canPublishResults(ADMIN_GOC, null).ok);
  // Ca thiếu ownerId không được thành cửa mở cho tất cả.
  check("ca thiếu ownerId → chỉ admin qua", !canPublishResults({ ...GV, userId: "u-gv" }, daXong).ok);
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
