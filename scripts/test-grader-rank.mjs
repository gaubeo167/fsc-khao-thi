#!/usr/bin/env node
/**
 * Test hồi quy: AI được phân công AI chấm
 * (apps/web/src/features/grading/lib/grader-rank.ts).
 *
 * Chạy:  node scripts/test-grader-rank.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Hộp "Phân công chấm" từng lọc người theo CƠ SỞ và MÔN nhưng không lọc theo
 * BẬC — Trưởng nhóm môn mở ra là thấy Admin cơ sở trong "Giáo viên khả dụng",
 * chọn được, lưu được. TBM giao việc cho cấp trên, và giao lặng lẽ: bản ghi
 * lưu thành công, người bị giao chỉ biết khi thấy việc lạ trong hàng đợi.
 *
 * Đây là lỗi phân quyền, nên khoá cả hai đầu: file này khoá luật ở giao diện,
 * và kiểm luôn rằng `firestore.rules` có vế tương ứng (`graderRankOk`) —
 * lọc ở giao diện mà quên rules thì gọi thẳng SDK là qua.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-grader-rank-")), "g.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/grading/lib/grader-rank.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { coTheGiaoCham, laBacAdmin, lyDoKhongGiaoDuoc, locNguoiChamKhaDung } =
  await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const ADMIN = ["superadmin", "academic-director", "campus-admin"];

/* ── 1. Bậc admin ────────────────────────────────────────────────────── */
{
  for (const r of ADMIN) check(`\`${r}\` là bậc admin`, laBacAdmin(r) === true);
  check("`subject-lead` KHÔNG phải bậc admin", laBacAdmin("subject-lead") === false);
  check("`teacher` KHÔNG phải bậc admin", laBacAdmin("teacher") === false);
  check("thiếu vai trò → không phải bậc admin", laBacAdmin(undefined) === false);
}

/* ── 2. TBM KHÔNG giao được cho bậc admin — chính là lỗi cần khoá ────── */
{
  for (const r of ADMIN) {
    check(
      `TBM không giao được cho \`${r}\``,
      coTheGiaoCham("subject-lead", r) === false,
    );
  }
  check("TBM giao được cho giáo viên", coTheGiaoCham("subject-lead", "teacher") === true);
  check(
    "TBM giao được cho TBM khác (ngang bậc, cùng tổ)",
    coTheGiaoCham("subject-lead", "subject-lead") === true,
  );
  check(
    "TBM không giao được cho học sinh",
    coTheGiaoCham("subject-lead", "student") === false,
  );
}

/* ── 3. Bậc admin vẫn giao được cho bất kỳ ai ────────────────────────── */
// Nếu siết cả admin thì admin hết tự nhận chấm được — đúng lý do họ có mặt
// trong danh sách này ngay từ đầu.
{
  for (const nguoiGiao of ADMIN) {
    for (const nguoiCham of [...ADMIN, "teacher", "subject-lead"]) {
      check(
        `\`${nguoiGiao}\` giao được cho \`${nguoiCham}\``,
        coTheGiaoCham(nguoiGiao, nguoiCham) === true,
      );
    }
  }
}

/* ── 4. Giáo viên thường không phân công ai ──────────────────────────── */
{
  check("giáo viên không giao được cho giáo viên", coTheGiaoCham("teacher", "teacher") === false);
  check("học sinh không giao được cho ai", coTheGiaoCham("student", "teacher") === false);
  check("chưa đăng nhập → không giao được", coTheGiaoCham(null, "teacher") === false);
  check("không biết vai người chấm → không giao", coTheGiaoCham("campus-admin", undefined) === false);
}

/* ── 5. Câu giải thích phải NÓI RA vì sao ────────────────────────────── */
// Nút khoá mà không nói lý do thì người dùng tưởng hỏng và bấm lại mãi.
{
  check("giao được thì không có lý do khoá", lyDoKhongGiaoDuoc("campus-admin", "teacher") === null);
  const ly = lyDoKhongGiaoDuoc("subject-lead", "campus-admin");
  check("TBP gặp admin → nói rõ là chuyện bậc", /admin/i.test(ly ?? ""), String(ly));
  check("luôn có câu nói khi bị chặn", typeof lyDoKhongGiaoDuoc("teacher", "teacher") === "string");
}

/* ── 6. Lọc danh sách: bậc · trạng thái · cơ sở · môn ────────────────── */
{
  const users = [
    { id: "gv1", role: "teacher", status: "active", campusId: "c1" },
    { id: "gv2", role: "teacher", status: "active", campusId: "c2" },
    { id: "gvNghi", role: "teacher", status: "suspended", campusId: "c1" },
    { id: "tbm", role: "subject-lead", status: "active", campusId: "c1" },
    { id: "ad", role: "campus-admin", status: "active", campusId: "c1" },
    { id: "gd", role: "academic-director", status: "active", campusId: "c1" },
    { id: "hs", role: "student", status: "active", campusId: "c1" },
    { id: "gvKhacMon", role: "teacher", status: "active", campusId: "c1" },
  ];
  const dungMon = (u) => u.id !== "gvKhacMon";

  const choTbm = locNguoiChamKhaDung(users, {
    vaiTroNguoiGiao: "subject-lead",
    campusId: "c1",
    dungMon,
  }).map((u) => u.id);
  check(
    "TBM chỉ thấy GV + TBM cùng cơ sở, cùng môn, đang hoạt động",
    JSON.stringify(choTbm) === JSON.stringify(["gv1", "tbm"]),
    choTbm.join(","),
  );
  check("admin cơ sở KHÔNG lọt vào danh sách của TBM", !choTbm.includes("ad"));
  check("giám đốc chuyên môn KHÔNG lọt vào danh sách của TBM", !choTbm.includes("gd"));

  const choAdmin = locNguoiChamKhaDung(users, {
    vaiTroNguoiGiao: "campus-admin",
    campusId: "c1",
    dungMon,
  }).map((u) => u.id);
  check(
    "admin vẫn thấy đủ cả bậc admin để tự nhận chấm",
    JSON.stringify(choAdmin) === JSON.stringify(["gv1", "tbm", "ad", "gd"]),
    choAdmin.join(","),
  );
  check("học sinh không bao giờ vào danh sách", !choAdmin.includes("hs"));
  check(
    "kể cả admin cũng không giao chấm cho học sinh",
    coTheGiaoCham("campus-admin", "student") === false &&
      coTheGiaoCham("superadmin", "student") === false,
  );
  check("người đã khoá tài khoản không vào danh sách", !choAdmin.includes("gvNghi"));

  const khongCoCoSo = locNguoiChamKhaDung(users, {
    vaiTroNguoiGiao: "campus-admin",
    campusId: null,
    dungMon,
  }).map((u) => u.id);
  check(
    "ca thi không gắn cơ sở → không cắt theo cơ sở",
    khongCoCoSo.includes("gv2"),
    khongCoCoSo.join(","),
  );

  const choGv = locNguoiChamKhaDung(users, {
    vaiTroNguoiGiao: "teacher",
    campusId: "c1",
    dungMon,
  });
  check("giáo viên thường không phân công được ai", choGv.length === 0);
}

/* ── 7. Rules phải có vế BẬC, không chỉ vế cơ sở ─────────────────────── */
// Lọc ở giao diện là gợi ý; gọi thẳng SDK vẫn qua nếu rules không chặn.
{
  const rules = readFileSync("firestore.rules", "utf8");
  const khoi = rules.slice(rules.indexOf("match /grading_assignments/"));
  const than = khoi.slice(0, khoi.indexOf("\n    }") + 6);
  check("rules có hàm `graderRankOk`", /function graderRankOk\(/.test(rules));
  const fnRank = rules.slice(
    rules.indexOf("function graderRankOk("),
    rules.indexOf("match /grading_assignments/"),
  );
  check(
    "TBM chỉ giao được cho teacher · subject-lead",
    /:\s*graderRole\(graderId\) in \["teacher", "subject-lead"\]/.test(fnRank),
    fnRank.trim().slice(0, 200),
  );
  check("`graderRankOk` phân nhánh theo `isAdmin()`", /isAdmin\(\)/.test(fnRank));
  check(
    "nhánh admin KHÔNG nhận `student`",
    !/student/.test(fnRank),
    fnRank.trim().slice(0, 200),
  );
  check(
    "hồ sơ người chấm không tồn tại → `exists()` chặn, không để `get()` nổ",
    /exists\([\s\S]{0,160}?\?[\s\S]{0,160}?get\(/.test(rules.slice(rules.indexOf("function graderRole("))),
  );
  for (const op of ["create", "update", "delete"]) {
    check(`rules kiểm bậc người chấm ở \`${op}\``, new RegExp(`allow ${op}[\\s\\S]{0,400}?graderRank\\w*\\(`).test(than));
  }
  check(
    "update kiểm cả bản cũ lẫn bản mới",
    /allow update:[\s\S]{0,400}?graderRankGoBoOk\(resource\.data\.graderId\)[\s\S]{0,200}?graderRankOk\(request\.resource\.data\.graderId\)/.test(than),
    than.slice(than.indexOf("allow update"), than.indexOf("allow delete")),
  );
  // Bản ghi trỏ vào tài khoản ĐÃ XOÁ mà siết bằng đúng luật của lượt đặt thì
  // thành mồ côi không ai gỡ nổi — dọn rác lại phải mở rules ra sửa.
  check(
    "admin vẫn gỡ được phân công trỏ vào tài khoản đã xoá",
    /function graderRankGoBoOk[\s\S]{0,160}?isAdmin\(\) \|\|/.test(rules),
  );
  check(
    "…nhưng ĐẶT người chấm thì vẫn phải là hồ sơ có thật",
    !/function graderRankOk[\s\S]{0,200}?isAdmin\(\) \|\|/.test(rules),
  );
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
