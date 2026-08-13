#!/usr/bin/env node
/**
 * Test hồi quy cho so khớp câu TRẢ LỜI NGẮN (apps/web/src/lib/exam/short-answer-match.ts).
 *
 * Chạy:  node scripts/test-short-answer.mjs
 *
 * Vì sao có file này: học sinh Việt gõ "0,25" trong khi giáo viên soạn "0.25";
 * so chuỗi thuần sẽ chấm SAI một câu trả lời đúng. Các ca dưới khoá lại hành vi
 * chuẩn hoá số, ký tự đại diện kiểu Moodle, % điểm từng đáp án, và khoá cả
 * ĐƯỜNG CŨ (mảng chuỗi trần) để câu hỏi đã có trong kho không đổi cách chấm.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-sa-")), "m.mjs");
execFileSync(
  "npx",
  ["esbuild", "src/lib/exam/short-answer-match.ts", "--bundle", "--format=esm",
   "--platform=node", `--outfile=${out}`],
  { cwd: "apps/web", stdio: "pipe" },
);
const { matchShortAnswer, parseVnNumber } = await import(out);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = Math.abs(got - want) < 1e-9;
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}: ${got}${ok ? "" : ` (mong đợi ${want})`}`);
  ok ? pass++ : fail++;
};
const r = (student, keys, cs = false) => matchShortAnswer(student, keys, cs).ratio;

console.log("── Số: dấu phẩy vs dấu chấm (lỗi đang có trên production) ──");
eq('HS gõ "0,25" · đáp án "0.25"', r("0,25", ["0.25"]), 1);
eq('HS gõ "0.25" · đáp án "0,25"', r("0.25", ["0,25"]), 1);
eq('HS gõ "5,0"  · đáp án "5"',    r("5,0", ["5"]), 1);
eq('HS gõ "5"    · đáp án "5,00"', r("5", ["5,00"]), 1);
eq('HS gõ "1/4"  · đáp án "0,25"', r("1/4", ["0,25"]), 1);
eq('HS gõ "-0,5" · đáp án "-.5"',  r("-0,5", ["-.5"]), 1);
eq('HS gõ "1 000"· đáp án "1000"', r("1 000", ["1000"]), 1);
eq('HS gõ " 12 " · đáp án "12"',   r(" 12 ", ["12"]), 1);
eq('HS gõ "0,26" · đáp án "0,25" (phải SAI)', r("0,26", ["0,25"]), 0);
eq('HS gõ "3"    · đáp án "8" (phải SAI)',    r("3", ["8"]), 0);

console.log("\n── Ký tự đại diện kiểu Moodle ──");
// Lưu ý: bản tóm tắt tài liệu Moodle ghi ran*ing khớp "running" — SAI.
// "running" bắt đầu bằng "run", không phải "ran"; tiền tố phải khớp đúng.
eq('"ranting" khớp "ran*ing"',    r("ranting", ["ran*ing"]), 1);
eq('"rankling" khớp "ran*ing"',   r("rankling", ["ran*ing"]), 1);
eq('"running" KHÔNG khớp "ran*ing" (tiền tố khác)', r("running", ["ran*ing"]), 0);
eq('"rowing" KHÔNG khớp "ran*ing"', r("rowing", ["ran*ing"]), 0);
eq('"running" khớp "r*ing"',      r("running", ["r*ing"]), 1);
eq('"fuel, oxygen" khớp "fuel*oxygen"', r("fuel, oxygen", ["fuel*oxygen"]), 1);
eq('"bất kỳ" khớp lưới hứng "*"', r("bất kỳ", ["*"]), 1);
eq('"2*3" khớp đáp án thoát "2\\*3"', r("2*3", ["2\\*3"]), 1);
eq('"243" KHÔNG khớp "2\\*3"',   r("243", ["2\\*3"]), 0);

console.log("\n── % điểm + khớp dòng đầu tiên (quy tắc Moodle) ──");
const keys = [
  { text: "Hà Nội", grade: 100 },
  { text: "Ha Noi", grade: 50, feedback: "Thiếu dấu tiếng Việt" },
  { text: "*", grade: 0, feedback: "Xem lại bài 3" },
];
eq('"Hà Nội" → 100%', r("Hà Nội", keys), 1);
eq('"Ha Noi" → 50%',  r("Ha Noi", keys), 0.5);
eq('"Sài Gòn" rơi vào lưới hứng → 0%', r("Sài Gòn", keys), 0);
const m = matchShortAnswer("Ha Noi", keys);
eq('phản hồi lấy đúng dòng khớp', m.feedback === "Thiếu dấu tiếng Việt" ? 1 : 0, 1);
eq('vị trí dòng khớp', m.index, 1);
eq('dòng trên chặn dòng dưới (không nhảy sang * )', r("Hà Nội", keys), 1);

console.log("\n── Hoa/thường + HỒI QUY đường cũ (mảng chuỗi trần) ──");
eq('không phân biệt hoa thường (mặc định)', r("hà nội", ["Hà Nội"]), 1);
eq('có phân biệt → sai', r("hà nội", ["Hà Nội"], true), 0);
eq('có phân biệt → đúng', r("Hà Nội", ["Hà Nội"], true), 1);
eq('mảng chuỗi cũ, nhiều đáp án', r("Hanoi", ["Hà Nội", "Hanoi"]), 1);
eq('đáp án rỗng → 0', r("gì đó", []), 0);
eq('HS bỏ trống → 0', r("", ["Hà Nội"]), 0);

console.log("\n── parseVnNumber: chỉ số mới quy về số ──");
eq('"abc" không phải số', parseVnNumber("abc") === null ? 1 : 0, 1);
eq('"1,5" = 1.5', parseVnNumber("1,5"), 1.5);
eq('"1.234,5" (kiểu VN) = 1234.5', parseVnNumber("1.234,5"), 1234.5);
eq('"1,234.5" (kiểu Anh) = 1234.5', parseVnNumber("1,234.5"), 1234.5);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
