#!/usr/bin/env node
/**
 * Test hồi quy cho luật "ai được sửa trực tiếp câu đã dùng trong đề"
 * (apps/web/src/features/question-bank/lib/edit-permission.ts).
 *
 * Chạy:  node scripts/test-edit-permission.mjs
 *
 * Vì sao có file này: đây là luật nới KHOÁ. Trước đó câu đã vào đề là không
 * ai sửa được, sai thì cũng chịu. Nới ra là đúng — bản đề đã đóng băng mới
 * là thứ giữ toàn vẹn dữ liệu, không phải cái khoá — nhưng nới sai một bậc
 * thì giáo viên môn khác sửa được đáp án của môn không phải của mình, và
 * sửa xong là điểm cả lớp đổi theo khi ai đó bấm chấm lại.
 *
 * Nên hai chiều đều phải khoá: đúng người thì KHÔNG được chặn (chặn nhầm là
 * quay lại đúng cái ngõ cụt cũ), sai người thì KHÔNG được lọt.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-editperm-")), "e.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/edit-permission.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { canEditInPlace } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/** Trưởng bộ môn có phạm vi cụ thể. */
const tbm = (subjects, grades) => ({
  role: "subject-lead",
  allowedSubjectIds: new Set(subjects),
  allowedGradeIds: grades === null ? null : new Set(grades),
});
const q = (subjectId, gradeId) => ({ subjectId, gradeId });

/* ── Vai trò quản trị: sửa được mọi môn ───────────────────────────────── */
for (const role of ["superadmin", "academic-director", "campus-admin"]) {
  check(
    `${role} sửa được`,
    canEditInPlace(
      { role, allowedSubjectIds: null, allowedGradeIds: null },
      q("subject-1", "grade-1"),
    ).allowed === true,
  );
}

/* ── Trưởng bộ môn: ĐÚNG môn + ĐÚNG khối ──────────────────────────────── */
{
  const actor = tbm(["subject-1", "subject-2"], ["grade-1", "grade-2"]);
  check("TBM đúng môn đúng khối → sửa được", canEditInPlace(actor, q("subject-1", "grade-1")).allowed === true);
  check("TBM đúng môn thứ hai cũng được", canEditInPlace(actor, q("subject-2", "grade-2")).allowed === true);
  check(
    "TBM SAI môn → chặn",
    canEditInPlace(actor, q("subject-9", "grade-1")).allowed === false,
  );
  check(
    "TBM đúng môn nhưng SAI khối → chặn",
    canEditInPlace(actor, q("subject-1", "grade-10")).allowed === false,
    JSON.stringify(canEditInPlace(actor, q("subject-1", "grade-10"))),
  );
}

/* ── gradeIds rỗng = phụ trách MỌI khối trong môn ─────────────────────── */
//
// Giống hệt quy ước của useUserScope. Nếu ai đó đổi thành "rỗng = không
// khối nào" thì 4 TBM đang chạy trên production mất quyền im lặng.
{
  const actor = tbm(["subject-1"], null);
  check("TBM không giới hạn khối: khối 1 được", canEditInPlace(actor, q("subject-1", "grade-1")).allowed === true);
  check("TBM không giới hạn khối: khối 12 cũng được", canEditInPlace(actor, q("subject-1", "grade-12")).allowed === true);
  check("nhưng vẫn không được sang môn khác", canEditInPlace(actor, q("subject-2", "grade-1")).allowed === false);
}

/* ── Giáo viên thường: KHÔNG, dù đúng môn đúng khối ───────────────────── */
{
  const gv = {
    role: "teacher",
    allowedSubjectIds: new Set(["subject-1"]),
    allowedGradeIds: new Set(["grade-1"]),
  };
  check("teacher đúng môn đúng khối vẫn bị chặn", canEditInPlace(gv, q("subject-1", "grade-1")).allowed === false);
}
check(
  "student bị chặn",
  canEditInPlace(
    { role: "student", allowedSubjectIds: null, allowedGradeIds: null },
    q("subject-1", "grade-1"),
  ).allowed === false,
);
check("chưa đăng nhập → chặn", canEditInPlace(null, q("subject-1", "grade-1")).allowed === false);

/* ── Dữ liệu thiếu: KHÔNG suy diễn thành cho phép ─────────────────────── */
{
  const actor = tbm(["subject-1"], ["grade-1"]);
  check("câu chưa gắn môn → chặn", canEditInPlace(actor, q(null, "grade-1")).allowed === false);
  check("câu chưa gắn khối (TBM có giới hạn khối) → chặn", canEditInPlace(actor, q("subject-1", null)).allowed === false);
  check(
    "TBM chưa được giao môn nào → chặn",
    canEditInPlace(tbm([], ["grade-1"]), q("subject-1", "grade-1")).allowed === false,
  );
  check(
    "TBM có allowedSubjectIds = null (không nên xảy ra) → chặn, không suy diễn thành được tất",
    canEditInPlace(
      { role: "subject-lead", allowedSubjectIds: null, allowedGradeIds: null },
      q("subject-1", "grade-1"),
    ).allowed === false,
  );
}

/* ── Luôn có lời giải thích, kể cả khi CHO PHÉP ───────────────────────── */
//
// Không có chuyện nút mờ đi mà không nói vì sao — đó là yêu cầu UX đã chốt.
{
  const ok = canEditInPlace(tbm(["subject-1"], ["grade-1"]), q("subject-1", "grade-1"));
  const no = canEditInPlace(tbm(["subject-1"], ["grade-1"]), q("subject-9", "grade-1"));
  check("cho phép vẫn kèm lý do", typeof ok.reason === "string" && ok.reason.length > 10, ok.reason);
  check("từ chối kèm lý do", typeof no.reason === "string" && no.reason.length > 10, no.reason);
}
// Lý do phải đọc được bằng TÊN môn/khối, không phải mã kiểu subject-9.
{
  const v = canEditInPlace(tbm(["subject-1"], ["grade-1"]), q("subject-9", "grade-10"), {
    subject: "Sinh học",
    grade: "Khối 10",
  });
  check("lý do dùng tên môn thay vì mã", v.reason.includes("Sinh học"), v.reason);
  check("không rò mã nội bộ ra câu giải thích", !v.reason.includes("subject-9"), v.reason);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
