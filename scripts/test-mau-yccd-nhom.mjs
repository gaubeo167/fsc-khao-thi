#!/usr/bin/env node
/**
 * Test hồi quy: CẢ HAI file mẫu mà hộp thoại nhập đề phát ra ("Mẫu cơ bản" và
 * "Mẫu theo mã YCCĐ") phải dạy được câu nhóm, và đọc ngược chính file đó phải
 * ra câu nhóm.
 *
 * Chạy:  node scripts/test-mau-yccd-nhom.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Dạng câu nhóm làm xong, bộ chấm chạy, màn soạn chạy — nhưng giáo viên tải
 * file mẫu về thì KHÔNG thấy loại G đâu. Lý do: file mẫu không phải một file
 * nằm trong repo, nó được SINH RA bằng code ở /api/import/*-template, và hộp
 * thoại chỉ phát hai mẫu (YCCĐ + cơ bản). Sửa một file .docx rời trong repo
 * thì không ai nhận được gì.
 *
 * Ca này đi trọn vòng đúng như người dùng:
 *
 *     route sinh mẫu → .docx thật → mammoth → htmlToMarkedText → parseGeneric
 *
 * Thêm hai chốt chặn nữa mà thiếu là cả tính năng vô hình:
 *   · bộ NHẬN DẠNG khuôn phải chấp nhận chữ G (file chỉ toàn câu nhóm)
 *   · bản nháp ghi vào kho phải mang đủ các ý phụ
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-mau-nhom-"));
function bundle(src, name) {
  const out = join(dir, name);
  execFileSync(
    "npx",
    ["esbuild", src, "--bundle", "--format=esm", "--platform=node", "--alias:@=./src", `--outfile=${out}`],
    { cwd: "apps/web", stdio: "pipe" },
  );
  return out;
}

const { htmlToMarkedText } = await import(
  bundle("src/features/question-bank/lib/parse-exam-bank.ts", "html.mjs")
);
const { parseGeneric } = await import(
  bundle("src/features/question-bank/lib/parse-generic.ts", "gen.mjs")
);
const { draftFromGeneric } = await import(
  bundle("src/features/question-bank/lib/import-draft.ts", "draft.mjs")
);
const { detectImportFormat } = await import(
  bundle("src/features/question-bank/lib/import-detect.ts", "detect.mjs")
);
const { Packer } = await import("docx");
const mammoth = (await import("mammoth")).default;

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── 1. Mẫu YCCĐ (mẫu hộp thoại nhập đề phát ra) ─────────────────────── */
//
// Nội dung tài liệu nằm ở lib (route chỉ đóng gói HTTP), nên đọc ngược được
// ĐÚNG file giáo viên tải về.
const { buildYccdTemplate } = await import(
  bundle("src/features/question-bank/lib/template-yccd.ts", "yccd.mjs")
);
const buf = await Packer.toBuffer(buildYccdTemplate());
const { value: html } = await mammoth.convertToHtml(
  { buffer: buf },
  { styleMap: ["p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "u => u"] },
);
const marked = htmlToMarkedText(html);

check("mẫu YCCĐ có nhắc chữ loại G", /G\s+Câu nhóm/.test(marked), marked.slice(0, 0));
check("mẫu YCCĐ có ví dụ mã .G01", /\[XX10\.01\.05\.G01\]/.test(marked));
check("mẫu YCCĐ có mốc ý phụ <1>", /<\s*1\s*>/.test(marked));
check("mẫu YCCĐ có <Key=70>", /<Key=70>/i.test(marked));

const { questions } = parseGeneric(marked);
const nhom = questions.find((q) => q.typeLetter === "G");
check("đọc ngược mẫu ra được câu nhóm", Boolean(nhom), `được ${questions.length} câu`);
if (nhom) {
  check("ngữ liệu chung giữ lại", /70% khối lượng tế bào/.test(nhom.content), nhom.content.slice(0, 80));
  check("ngữ liệu KHÔNG nuốt câu hỏi phụ", !/Những vai trò nào/.test(nhom.content));
  check("tách đúng 3 ý phụ", nhom.groupSubs.length === 3, String(nhom.groupSubs.length));
  check("ý 1 = một đáp án", nhom.groupSubs[0]?.type === "mcq-single", nhom.groupSubs[0]?.type);
  check("ý 1 lấy đúng đáp án gạch chân",
    nhom.groupSubs[0]?.options.find((o) => o.isCorrect)?.content?.includes("70%"),
    JSON.stringify(nhom.groupSubs[0]?.options));
  check("ý 2 = nhiều đáp án", nhom.groupSubs[1]?.type === "mcq-multi", nhom.groupSubs[1]?.type);
  check("ý 2 có 2 đáp án đúng", nhom.groupSubs[1]?.options.filter((o) => o.isCorrect).length === 2);
  check("ý 3 = trả lời ngắn", nhom.groupSubs[2]?.type === "short-answer", nhom.groupSubs[2]?.type);
  check("ý 3 lấy được <Key=70>", JSON.stringify(nhom.groupSubs[2]?.acceptedAnswers ?? []).includes("70"));

  const draft = draftFromGeneric(nhom, 1);
  check("bản nháp nhận dạng là câu nhóm", draft.type === "group", String(draft.type));
  check("bản nháp mang đủ 3 ý phụ", draft.groupSubs.length === 3, String(draft.groupSubs.length));
}

/* ── 2. Mẫu CƠ BẢN (nút đầu tiên trong hộp thoại) ────────────────────── */
//
// Đây là nút người dùng bấm nhiều nhất — nó đứng trước và dành cho đề soạn
// nhanh. Mẫu YCCĐ có mà mẫu này thiếu thì phần lớn giáo viên vẫn không thấy
// dạng câu nhóm ở đâu.
{
  const { buildBasicTemplate } = await import(
    bundle("src/features/question-bank/lib/template-co-ban.ts", "coban.mjs")
  );
  const buf2 = await Packer.toBuffer(buildBasicTemplate());
  const { value: html2 } = await mammoth.convertToHtml(
    { buffer: buf2 },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "u => u",
      ],
    },
  );
  const marked2 = htmlToMarkedText(html2);
  check("mẫu cơ bản có nhãn NHOM trong bảng dạng câu", /NHOM/.test(marked2));
  check("mẫu cơ bản có ví dụ [TH][NHOM]", /\[TH\]\[NHOM\]/.test(marked2));
  check("mẫu cơ bản có mốc ý phụ <1>", /<\s*1\s*>/.test(marked2));

  const r2 = parseGeneric(marked2);
  const nhom2 = r2.questions.find((q) => q.typeTag === "group");
  check("đọc ngược mẫu cơ bản ra được câu nhóm", Boolean(nhom2), `được ${r2.questions.length} câu`);
  if (nhom2) {
    check("ngữ liệu chung giữ lại", /70% khối lượng tế bào/.test(nhom2.content));
    check("tách đúng 3 ý phụ", nhom2.groupSubs.length === 3, String(nhom2.groupSubs.length));
    check("ý 1 = một đáp án", nhom2.groupSubs[0]?.type === "mcq-single", nhom2.groupSubs[0]?.type);
    check("ý 2 = nhiều đáp án", nhom2.groupSubs[1]?.type === "mcq-multi", nhom2.groupSubs[1]?.type);
    check("ý 3 = trả lời ngắn", nhom2.groupSubs[2]?.type === "short-answer", nhom2.groupSubs[2]?.type);
    const d2 = draftFromGeneric(nhom2, 1);
    check("bản nháp từ mẫu cơ bản là câu nhóm", d2.type === "group", String(d2.type));
    check("bản nháp mang đủ 3 ý", d2.groupSubs.length === 3, String(d2.groupSubs.length));
  }
}

/* ── 3. Bộ nhận dạng khuôn phải chấp nhận chữ G ──────────────────────── */
//
// File chỉ toàn câu nhóm mà bộ nhận dạng không biết chữ G thì nó rơi sang
// khuôn khác và cả file đọc ra rỗng — tính năng có mà không ai dùng được.
const chiCauNhom = [
  "[SI10.02.2.G01] Đọc đoạn văn sau.",
  "Một đoạn ngữ liệu.",
  "<1> Câu hỏi phụ?",
  "A. Sai",
  "B. Đúng",
].join("\n");
const d = detectImportFormat(chiCauNhom);
check("file chỉ toàn câu nhóm được nhận là khuôn mã đề", d.format === "ma-de", String(d.format));

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
