#!/usr/bin/env node
/**
 * Test hồi quy cho luật "cơ sở đang thao tác thấy môn nào, khối nào"
 * (apps/web/src/features/campus/lib/campus-scope.ts).
 *
 * Chạy:  node scripts/test-campus-scope.mjs
 *
 * Vì sao có file này: ô chọn Môn/Khối trong hộp "Tải đề lên" từng đọc THẲNG
 * store, không lọc cơ sở, trong khi bộ lọc của chính trang Ngân hàng câu hỏi
 * ngay bên ngoài thì có lọc.
 *
 * Hậu quả không dừng ở "hiện thừa vài dòng". Hai cơ sở có thể cùng có môn tên
 * "Sinh học" nhưng là HAI bản ghi khác nhau. Danh sách không lọc hiện cả hai
 * với CÙNG một cái tên; chọn nhầm bản của cơ sở khác thì khung YCCĐ dựng theo
 * môn đó, và đề trích dẫn mã CÓ THẬT vẫn báo "khung không có mã đó" — người
 * dùng mở khung ra nhìn thấy mã sờ sờ mà không hiểu vì sao.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-campus-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/campus/lib/campus-scope.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { operatingCampusId, subjectsInCampus, gradesInCampus } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── 1. Cơ sở đang thao tác ────────────────────────────────────────────── */
{
  check(
    "superadmin đi theo cơ sở đang chọn trên thanh trên",
    operatingCampusId("superadmin", null, "dn-1") === "dn-1",
  );
  check(
    "vai khác luôn là cơ sở của chính họ, KHÔNG nghe thanh trên",
    operatingCampusId("teacher", "dn-3", "dn-1") === "dn-3",
  );
  check(
    "campus-admin cũng vậy",
    operatingCampusId("campus-admin", "dn-2", "dn-1") === "dn-2",
  );
  check("không xác định được → null", operatingCampusId("teacher", null, null) === null);
  check(
    "superadmin chưa chọn cơ sở → null (không lọc)",
    operatingCampusId("superadmin", null, null) === null,
  );
}

/* ── 2. Ca thật: hai cơ sở cùng có môn tên "Sinh học" ─────────────────── */
// Đây là ca đã gây ra vụ "khung có SI10.02.12.S05 mà báo không có". Hai bản
// ghi khác id, CÙNG tên hiển thị — danh sách không lọc thì người dùng không
// tài nào phân biệt được.
{
  const dn1 = { id: "dn-1", gradeIds: ["grade-10", "grade-11"] };
  const dn3 = { id: "dn-3", gradeIds: ["grade-10"] };
  const subjects = [
    { id: "sinh-dn1", name: "Sinh học", gradeIds: ["grade-10"], campusIds: ["dn-1"] },
    { id: "sinh-dn3", name: "Sinh học", gradeIds: ["grade-10"], campusIds: ["dn-3"] },
  ];
  const atDn3 = subjectsInCampus(subjects, dn3);
  check("cơ sở 3 chỉ thấy môn Sinh CỦA MÌNH", atDn3.length === 1, String(atDn3.length));
  check("và đúng bản ghi của mình", atDn3[0]?.id === "sinh-dn3", atDn3[0]?.id);
  check(
    "cơ sở 1 không thấy môn của cơ sở 3",
    subjectsInCampus(subjects, dn1).map((s) => s.id).join() === "sinh-dn1",
  );
  check(
    "không lọc (chưa xác định cơ sở) thì thấy CẢ HAI — đúng chỗ sinh ra lỗi cũ",
    subjectsInCampus(subjects, null).length === 2,
  );
}

/* ── 3. Môn dùng chung mọi cơ sở ───────────────────────────────────────── */
{
  const dn3 = { id: "dn-3", gradeIds: ["grade-10"] };
  check(
    "campusIds rỗng = dùng chung → thấy",
    subjectsInCampus([{ id: "chung", gradeIds: ["grade-10"], campusIds: [] }], dn3).length === 1,
  );
  check(
    "thiếu hẳn campusIds = dùng chung → thấy",
    subjectsInCampus([{ id: "chung2", gradeIds: ["grade-10"] }], dn3).length === 1,
  );
  check(
    "campusIds có cơ sở khác → KHÔNG thấy",
    subjectsInCampus([{ id: "cua-ai-do", gradeIds: ["grade-10"], campusIds: ["dn-1"] }], dn3)
      .length === 0,
  );
}

/* ── 4. Phải trùng khối, không chỉ trùng cơ sở ─────────────────────────── */
{
  const capHai = { id: "c2", gradeIds: ["grade-6", "grade-7"] };
  check(
    "môn cấp 3 không hiện ở cơ sở chỉ có cấp 2",
    subjectsInCampus([{ id: "t10", gradeIds: ["grade-10"], campusIds: [] }], capHai).length === 0,
  );
  check(
    "trùng ÍT NHẤT một khối là đủ",
    subjectsInCampus(
      [{ id: "lien-cap", gradeIds: ["grade-7", "grade-10"], campusIds: [] }],
      capHai,
    ).length === 1,
  );
}

/* ── 5. Khối theo cơ sở ────────────────────────────────────────────────── */
{
  const g = [{ id: "grade-6" }, { id: "grade-7" }, { id: "grade-10" }];
  check(
    "chỉ thấy khối cơ sở mình có",
    gradesInCampus(g, { id: "c2", gradeIds: ["grade-6", "grade-7"] })
      .map((x) => x.id)
      .join() === "grade-6,grade-7",
  );
  check("chưa xác định cơ sở → thấy hết", gradesInCampus(g, null).length === 3);
  check(
    "cơ sở không có khối nào → rỗng, KHÔNG lùi về hiện hết",
    gradesInCampus(g, { id: "trong", gradeIds: [] }).length === 0,
  );
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
