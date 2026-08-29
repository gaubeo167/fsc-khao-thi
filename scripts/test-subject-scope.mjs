#!/usr/bin/env node
/**
 * Test hồi quy cho phạm vi MÔN của người dùng
 * (apps/web/src/features/auth/lib/subject-scope.ts).
 *
 * Chạy:  node scripts/test-subject-scope.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Trưởng nhóm môn Toán từng xem được — và duyệt được — câu hỏi, gói đề của
 * môn Sinh, và ô chọn người chấm hiện cả giáo viên môn khác. Ba màn đó giờ
 * đều cắt theo môn bằng CÙNG một hàm ở đây:
 *
 *   • hàng đợi Phê duyệt (câu hỏi · gói đề · học liệu)
 *   • kho "Đề theo YCCĐ"
 *   • ô chọn giáo viên chấm bài
 *
 * Một luật, ba chỗ dùng. Nới luật này ra là lộ dữ liệu môn khác ở cả ba, mà
 * lộ phân quyền thì không ai thấy cho tới lúc đã lộ. Nên khoá cả hai phía:
 * không được rộng thêm, và cũng không được chặt tới mức hồ sơ cũ mất quyền.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-scope-")), "s.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/auth/lib/subject-scope.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { subjectIdsOfUser, userTeachesSubject, filterSubjectsByScope, filterGradesByScope } =
  await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const SUBJECTS = [
  { id: "s-toan", name: "Toán", code: "TOAN" },
  { id: "s-van", name: "Ngữ văn", code: "VAN" },
  { id: "s-sinh", name: "Sinh học", code: "SINH" },
];
const ids = (u) => {
  const r = subjectIdsOfUser(u, SUBJECTS);
  return r == null ? null : [...r].sort();
};

/* ── 1. Bậc admin: không giới hạn ────────────────────────────────────── */
for (const role of ["superadmin", "academic-director", "campus-admin"]) {
  check(`${role} → null (không giới hạn)`, ids({ role }) === null);
  check(`${role} chạm được mọi môn`, userTeachesSubject({ role }, "s-sinh", SUBJECTS));
}

/* ── 2. subjectIds là nguồn chuẩn ────────────────────────────────────── */
{
  const u = { role: "subject-lead", subjectIds: ["s-toan"] };
  check("TBM Toán chỉ có môn Toán", JSON.stringify(ids(u)) === '["s-toan"]', JSON.stringify(ids(u)));
  check("TBM Toán KHÔNG chạm được môn Sinh", !userTeachesSubject(u, "s-sinh", SUBJECTS));
  check("TBM Toán chạm được môn Toán", userTeachesSubject(u, "s-toan", SUBJECTS));

  const nhieu = { role: "teacher", subjectIds: ["s-toan", "s-van"] };
  check("GV dạy hai môn giữ cả hai", JSON.stringify(ids(nhieu)) === '["s-toan","s-van"]');
}

/* ── 3. Hồ sơ CŨ chỉ có `subject` dạng chữ tự do ─────────────────────── */
// Seed thật đang ở dạng này (`subject: "Toán"`, chưa có subjectIds). Siết
// quá tay ở đây là TBM hiện có mất sạch quyền — hỏng nặng hơn lỗi đang sửa.
{
  check("khớp đúng hệt tên môn", JSON.stringify(ids({ role: "subject-lead", subject: "Toán" })) === '["s-toan"]');
  check("khớp không phân biệt hoa thường", JSON.stringify(ids({ role: "teacher", subject: "  toán " })) === '["s-toan"]');
  check("khớp theo MÃ môn", JSON.stringify(ids({ role: "teacher", subject: "VAN" })) === '["s-van"]');
  // "Văn" trong seed vs "Ngữ văn" trong kho môn — bậc khớp chứa nhau.
  check("tên cũ 'Văn' vẫn ra 'Ngữ văn'", JSON.stringify(ids({ role: "teacher", subject: "Văn" })) === '["s-van"]');
  check("môn không có trong kho → rỗng", JSON.stringify(ids({ role: "teacher", subject: "Hoá" })) === "[]");
}

/* ── 4. subjectIds THẮNG chữ tự do ───────────────────────────────────── */
{
  const u = { role: "teacher", subjectIds: ["s-sinh"], subject: "Toán" };
  check(
    "có subjectIds thì bỏ qua `subject` cũ",
    JSON.stringify(ids(u)) === '["s-sinh"]',
    JSON.stringify(ids(u)),
  );
}

/* ── 5. Không có gì → không chạm được gì ─────────────────────────────── */
{
  check("GV chưa được giao môn → rỗng", JSON.stringify(ids({ role: "teacher" })) === "[]");
  check("…và không chạm được môn nào", !userTeachesSubject({ role: "teacher" }, "s-toan", SUBJECTS));
  check("người dùng null → rỗng, không nổ", JSON.stringify(ids(null)) === "[]");
  check("null KHÔNG được coi là không giới hạn", subjectIdsOfUser(null, SUBJECTS) !== null);
  check("subjectIds rỗng ≠ không giới hạn", JSON.stringify(ids({ role: "teacher", subjectIds: [] })) === "[]");
}

/* ── 6. Không có môn để so thì KHÔNG cho qua ─────────────────────────── */
// Dữ liệu cũ thiếu subjectId phải rơi về "không thấy", không phải "thấy hết".
{
  const u = { role: "subject-lead", subjectIds: ["s-toan"] };
  check("subjectId null → false", !userTeachesSubject(u, null, SUBJECTS));
  check("subjectId rỗng → false", !userTeachesSubject(u, "", SUBJECTS));
  check("nhưng admin vẫn qua", userTeachesSubject({ role: "campus-admin" }, null, SUBJECTS));
}

/* ── 7. Lọc DANH SÁCH cho ô chọn ─────────────────────────────────────────
 *
 * Đây là vế từng thiếu và thiếu rất khó thấy: danh sách câu hỏi ĐÃ cắt đúng
 * nên nhìn qua tưởng phân quyền chạy, nhưng hai ô lọc Môn/Khối vẫn liệt kê
 * mọi môn và mọi khối của cơ sở. TBM Toán (môn Toán, khối 6+7) mở Ngân hàng
 * câu hỏi ra vẫn thấy "Sinh học" và thấy khối 8, 9.
 */
{
  const MON = [{ id: "s-toan" }, { id: "s-van" }, { id: "s-sinh" }];
  const KHOI = [{ id: "g6" }, { id: "g7" }, { id: "g8" }, { id: "g9" }];
  const ids = (xs) => xs.map((x) => x.id);

  const tbmToan = {
    allowedSubjectIds: new Set(["s-toan"]),
    allowedGradeIds: new Set(["g6", "g7"]),
    isUnscoped: false,
    hasScope: true,
  };
  check(
    "ô chọn MÔN của TBM Toán chỉ còn Toán",
    JSON.stringify(ids(filterSubjectsByScope(MON, tbmToan))) === '["s-toan"]',
    JSON.stringify(ids(filterSubjectsByScope(MON, tbmToan))),
  );
  check(
    "ô chọn KHỐI chỉ còn 6 và 7",
    JSON.stringify(ids(filterGradesByScope(KHOI, tbmToan))) === '["g6","g7"]',
    JSON.stringify(ids(filterGradesByScope(KHOI, tbmToan))),
  );

  const adm = { allowedSubjectIds: null, allowedGradeIds: null, isUnscoped: true, hasScope: true };
  check("admin vẫn thấy đủ môn", filterSubjectsByScope(MON, adm).length === 3);
  check("admin vẫn thấy đủ khối", filterGradesByScope(KHOI, adm).length === 4);

  // Không giao khối nào = mọi khối TRONG môn được giao. Đây là quy ước, không
  // phải bỏ sót — siết chỗ này là TBM chưa gán khối mất sạch ô chọn.
  const chuaGanKhoi = {
    allowedSubjectIds: new Set(["s-toan"]),
    allowedGradeIds: null,
    isUnscoped: false,
    hasScope: true,
  };
  check("chưa gán khối → ô khối giữ nguyên đủ", filterGradesByScope(KHOI, chuaGanKhoi).length === 4);
  check("…nhưng ô môn vẫn cắt", JSON.stringify(ids(filterSubjectsByScope(MON, chuaGanKhoi))) === '["s-toan"]');

  const chuaGanMon = {
    allowedSubjectIds: new Set(),
    allowedGradeIds: null,
    isUnscoped: false,
    hasScope: false,
  };
  check("chưa gán môn nào → ô môn rỗng, không lộ gì", filterSubjectsByScope(MON, chuaGanMon).length === 0);
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
