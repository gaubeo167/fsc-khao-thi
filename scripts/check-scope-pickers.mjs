#!/usr/bin/env node
/**
 * Bánh cóc: ô chọn Môn · Khối phải cắt theo phạm vi người dùng.
 *
 * Chạy:  node scripts/check-scope-pickers.mjs
 * Hạ mốc sau khi di cư xong một mảng:  node scripts/check-scope-pickers.mjs --update
 *
 * ── Vì sao cần một bánh cóc, không phải một test ────────────────────────
 *
 * Test đơn vị khoá được `filterSubjectsByScope` chạy đúng. Nó KHÔNG khoá được
 * lỗi thật: một màn mới dựng <option> thẳng từ kho và quên gọi hàm đó.
 *
 * Lỗi ấy đã xảy ra 8 lần cùng một kiểu. Nguy hiểm ở chỗ nó ẩn sau vẻ đúng:
 * danh sách dữ liệu bên dưới ĐÃ cắt theo môn·khối, nên nhìn qua tưởng phân
 * quyền chạy. Chỉ có ô lọc là còn liệt kê đủ — TBM Toán (môn Toán, khối 6+7)
 * mở Ngân hàng câu hỏi ra vẫn thấy "Sinh học" và thấy khối 8, 9.
 *
 * Rò ở ô chọn không chỉ xấu: nó lộ trường đang dạy môn nào, mở khối nào, và
 * mời người dùng bấm vào một lựa chọn mà bấm xong chỉ ra danh sách rỗng.
 *
 * Luật: file nào DỰNG danh sách môn/khối cho người dùng chọn thì phải nhắc
 * tới một trong các mốc phạm vi (`useUserScope`, `filterSubjectsByScope`,
 * `filterGradesByScope`, `isInScope`, `allowedSubjectIds`, `allowedGradeIds`).
 *
 * MIỄN TRỪ có chủ ý — màn quản trị danh mục, nơi liệt kê hết là ĐÚNG:
 * quản lý Môn · Khối · Cơ sở, và form admin gán môn cho giáo viên. Danh sách
 * miễn trừ nằm ngay dưới, không nằm ở file mốc, để ai thêm vào phải giải
 * thích bằng chữ.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const GOC = "apps/web/src";
const MOC = "scripts/scope-pickers-baseline.json";

/** Màn QUẢN TRỊ danh mục — liệt kê hết là cố ý, và chỉ admin vào được. */
const MIEN_TRU = new Set([
  // Quản lý danh mục: phải thấy mọi môn/khối để sửa chính chúng.
  "app/(authenticated)/admin/subjects/page.tsx",
  "app/(authenticated)/admin/grades/page.tsx",
  "app/(authenticated)/admin/campuses/page.tsx",
  "features/subjects/dialogs/subject-dialog.tsx",
  "features/grades/dialogs/grade-dialog.tsx",
  "features/campus/dialogs/campus-dialog.tsx",
  // Admin gán môn/khối CHO người khác — phải chọn được bất kỳ môn nào.
  "features/admin/users/dialogs/user-form-fields.tsx",
  "features/admin/users/dialogs/bulk-create-students-dialog.tsx",
  "features/admin/users/users-filter-bar.tsx",
  "features/admin/users/users-table.tsx",
  "features/teaching/components/teaching-assignments-editor.tsx",
]);

/** Dựng danh sách môn/khối cho người dùng CHỌN (không phải tra tên để hiện). */
const DUNG_O_CHON = /\b(?:all)?(?:Subjects|Grades|subjects|grades)\.(?:map|filter)\s*\(/;
/** Tra tên để hiển thị — không phải ô chọn, không rò gì. */
const CHI_TRA_TEN = /new Map\(\s*(?:all)?(?:subjects|grades)\.map/i;
const MOC_PHAM_VI =
  /useUserScope|filterSubjectsByScope|filterGradesByScope|isInScope|allowedSubjectIds|allowedGradeIds/;

function quet(dir, ra = []) {
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    if (statSync(p).isDirectory()) quet(p, ra);
    else if (ten.endsWith(".tsx")) ra.push(p);
  }
  return ra;
}

const viPham = [];
for (const p of quet(GOC)) {
  const rel = p.slice(GOC.length + 1);
  if (MIEN_TRU.has(rel)) continue;
  // Màn học sinh không có phạm vi môn.
  if (/^app\/\(authenticated\)\/(my-|exam\/|dashboard)/.test(rel)) continue;
  const src = readFileSync(p, "utf8");
  if (!DUNG_O_CHON.test(src)) continue;
  // Chỉ tra tên để hiện thì bỏ qua.
  const chiTraTen = src
    .split("\n")
    .filter((l) => DUNG_O_CHON.test(l))
    .every((l) => CHI_TRA_TEN.test(l));
  if (chiTraTen) continue;
  if (MOC_PHAM_VI.test(src)) continue;
  viPham.push(rel);
}
viPham.sort();

const co = process.argv.includes("--update");
let moc = [];
try {
  moc = JSON.parse(readFileSync(MOC, "utf8")).files ?? [];
} catch {
  /* chưa có mốc */
}

if (co) {
  writeFileSync(MOC, JSON.stringify({ files: viPham }, null, 2) + "\n");
  console.log(`Đã hạ mốc xuống ${viPham.length} chỗ.`);
  process.exit(0);
}

const cu = new Set(moc);
const moi = viPham.filter((f) => !cu.has(f));
const daSua = moc.filter((f) => !viPham.includes(f));

console.log(`Ô chọn Môn·Khối chưa cắt phạm vi: ${viPham.length} (mốc ${moc.length})`);
for (const f of viPham) console.log(`    ${f}`);
if (daSua.length) {
  console.log(`\n✓ Đã sửa ${daSua.length} chỗ — chạy --update để hạ mốc:`);
  for (const f of daSua) console.log(`    ${f}`);
}
if (moi.length) {
  console.log(`\n✗ THÊM MỚI ${moi.length} chỗ chưa cắt phạm vi:`);
  for (const f of moi) console.log(`    ${f}`);
  console.log(
    "\n  Gọi filterSubjectsByScope / filterGradesByScope (features/auth/lib/use-scope).\n" +
      "  Nếu đây là màn quản trị danh mục và liệt kê hết là CỐ Ý, thêm vào\n" +
      "  MIEN_TRU trong chính file này kèm một dòng giải thích — đừng nâng mốc.",
  );
  process.exit(1);
}
console.log("✓ Không tăng.");
