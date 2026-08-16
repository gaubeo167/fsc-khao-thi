#!/usr/bin/env node
/**
 * Test hồi quy cho bộ soát MÔN / KHỐI khi nhập khung YCCĐ
 * (apps/web/src/features/competencies/lib/framework-scope.ts).
 *
 * Chạy:  node scripts/test-framework-scope.mjs
 *
 * Vì sao có file này: người dùng báo "chọn môn Toán khối 1 lại ra khung YCCĐ
 * của môn Sinh khối 10". Không màn hình nào trộn môn — chỗ nào cũng lọc theo
 * `subjectId` — nên các node đó THẬT SỰ đang nằm trong môn Toán. Chúng vào
 * được là vì màn nhập khung ghi thẳng vào môn + khối đang chọn mà không đối
 * chiếu gì với nội dung file, và một lần chọn nhầm là không có màn nào phát
 * hiện hộ về sau.
 *
 * Mã YCCĐ tự mang thông tin môn (chữ) và khối (số), nên bắt được ngay lúc
 * nhập. Các ca dưới khoá lại đúng hành vi đó, gồm cả việc KHÔNG kêu oan.
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
    "src/features/competencies/lib/framework-scope.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { checkFrameworkScope, codePrefix, gradeNumber } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const SINH10 = ["SI10.01", "SI10.01.1", "SI10.01.1.D01", "SI10.02.12.D08"];
const TOAN10 = ["TO10.01", "TO10.01.1.D01"];

/* ── Đúng ca người dùng gặp ───────────────────────────────────────────── */
{
  const w = checkFrameworkScope({
    codes: SINH10,
    existingCodes: [],
    gradeName: "Khối 1",
    subjectName: "Toán",
  });
  check("khung SI10 nhập vào Khối 1 → có cảnh báo", w.length > 0, JSON.stringify(w));
  check("nói rõ lệch KHỐI", w.some((x) => x.kind === "khac-khoi"), JSON.stringify(w));
  check(
    "câu chữ nêu cả mã lẫn khối đang chọn",
    /SI10/.test(w[0]?.message ?? "") && /Khối 1/.test(w[0]?.message ?? ""),
    w[0]?.message,
  );
}

/* ── Lệch MÔN: môn đang có mã TO…, file lại toàn SI… ──────────────────── */
{
  const w = checkFrameworkScope({
    codes: SINH10,
    existingCodes: TOAN10,
    gradeName: "Khối 10",
    subjectName: "Toán",
  });
  check("khung SI10 nhập vào môn đang dùng mã TO10 → cảnh báo lệch môn",
    w.some((x) => x.kind === "khac-mon"), JSON.stringify(w));
  check("khối khớp thì KHÔNG kêu lệch khối", !w.some((x) => x.kind === "khac-khoi"));
}

/* ── Không kêu oan ────────────────────────────────────────────────────── */
{
  const dung = checkFrameworkScope({
    codes: SINH10,
    existingCodes: [],
    gradeName: "Khối 10",
    subjectName: "Sinh học",
  });
  check("đúng môn đúng khối → im lặng", dung.length === 0, JSON.stringify(dung));

  const themVao = checkFrameworkScope({
    codes: SINH10,
    existingCodes: ["SI10.03.1.D01"],
    gradeName: "Khối 10",
    subjectName: "Sinh học",
  });
  check("bổ sung thêm vào khung cùng mã → im lặng", themVao.length === 0);

  const khongMa = checkFrameworkScope({
    codes: ["Chương 1", "1.1"],
    existingCodes: [],
    gradeName: "Khối 1",
    subjectName: "Toán",
  });
  check("mã không theo quy ước → không đoán, im lặng", khongMa.length === 0);

  const khongSo = checkFrameworkScope({
    codes: ["SI.01.1.D01"],
    existingCodes: [],
    gradeName: "Khối 10",
    subjectName: "Sinh học",
  });
  check("mã không có số khối → không kết luận về khối", !khongSo.some((x) => x.kind === "khac-khoi"));

  const tenKhoiLa = checkFrameworkScope({
    codes: SINH10,
    existingCodes: [],
    gradeName: "Lớp chuyên",
    subjectName: "Sinh học",
  });
  check("tên khối không có số → không kết luận về khối",
    !tenKhoiLa.some((x) => x.kind === "khac-khoi"));
}

/* ── Lấy đầu mã theo SỐ ĐÔNG, không theo dòng đầu ─────────────────────── */
{
  const w = checkFrameworkScope({
    // Một mã lạc loài không được kéo cả kết luận đi theo.
    codes: ["TO10.01.1.D01", "SI10.01", "SI10.01.1.D01", "SI10.02.1.D02"],
    existingCodes: [],
    gradeName: "Khối 10",
    subjectName: "Sinh học",
  });
  check("một mã lạc không lật ngược kết luận", w.length === 0, JSON.stringify(w));
}

/* ── Hàm phụ ──────────────────────────────────────────────────────────── */
check("codePrefix tách chữ và số", (() => {
  const p = codePrefix("SI10.02.12.D08");
  return p?.letters === "SI" && p.grade === 10 && p.raw === "SI10";
})());
check("codePrefix với mã một chữ cái", codePrefix("T1.01.1.D01")?.grade === 1);
check("codePrefix mã rỗng → null", codePrefix("") === null);
check("gradeNumber đọc số trong tên khối", gradeNumber("Khối 10") === 10);
check("gradeNumber tên không số → null", gradeNumber("Lớp chuyên") === null);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
