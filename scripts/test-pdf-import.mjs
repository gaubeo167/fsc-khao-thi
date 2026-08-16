#!/usr/bin/env node
/**
 * Test hồi quy cho đường nhập đề từ PDF
 * (apps/web/src/app/api/import/parse-questions/pdf-text.ts).
 *
 * Chạy:  node scripts/test-pdf-import.mjs
 *
 * Phần đầu chạy trên chuỗi dựng sẵn — luôn chạy được, kể cả máy không có
 * file đề thật. Phần sau chỉ chạy khi thư mục `de-mau/` có file (thư mục này
 * KHÔNG nằm trong repo), và đó là phần chứng minh thật: PDF đề thi thật vào
 * ra đúng số câu.
 *
 * Vì sao cần: PDF khác Word ở chỗ không mang gạch chân, và có loại PDF không
 * chứa chữ nào (bản scan). Cả hai đều dễ ra thông báo sai địa chỉ — "không
 * nhận ra cấu trúc câu hỏi" trong khi thật ra file không có chữ để nhận.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-pdf-"));
const bundle = (src, name) => {
  const out = join(dir, name);
  execFileSync(
    "npx",
    [
      "esbuild",
      src,
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--alias:@=./src",
      `--outfile=${out}`,
    ],
    { cwd: "apps/web", stdio: "pipe" },
  );
  return out;
};
const { extractPdfText, normalisePdfText, looksScanned } = await import(
  bundle("src/app/api/import/parse-questions/pdf-text.ts", "pdf.mjs")
);
const { parseGeneric } = await import(
  bundle("src/features/question-bank/lib/parse-generic.ts", "gen.mjs")
);
const { detectImportFormat } = await import(
  bundle("src/features/question-bank/lib/import-detect.ts", "det.mjs")
);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Dọn văn bản PDF ──────────────────────────────────────────────────── */
check(
  "nối lại từ bị gạch nối cuối dòng",
  normalisePdfText("nhiễm sắc-\nthể kép") === "nhiễm sắcthể kép",
  normalisePdfText("nhiễm sắc-\nthể kép"),
);
check(
  "gạch nối giữa hai chữ KHÔNG phải ngắt từ thì giữ nguyên dòng",
  normalisePdfText("Câu 1. A\nB. hai").split("\n").length === 2,
);
check(
  "bỏ dòng số trang",
  normalisePdfText("Câu 1. Đề\nTrang 1/3\nA. một") === "Câu 1. Đề\nA. một",
  JSON.stringify(normalisePdfText("Câu 1. Đề\nTrang 1/3\nA. một")),
);
check(
  "bỏ dòng mã đề + trang",
  !normalisePdfText("Mã đề 0401 Trang 1/3\nCâu 1. Đề").includes("0401"),
);
check(
  "bỏ dòng ---HẾT---",
  !normalisePdfText("Câu 1. Đề\n--- HẾT ---").includes("HẾT"),
);
check(
  "KHÔNG ăn nhầm dòng có chữ 'trang' trong câu văn",
  normalisePdfText("Câu 1. Xem trang 12 của sách giáo khoa").includes("trang 12"),
);
check("gộp khoảng trắng thừa trong dòng", normalisePdfText("A.    một") === "A. một");

/* ── Nhận diện bản scan ───────────────────────────────────────────────── */
check("chuỗi rỗng → coi là bản scan", looksScanned(""));
check("vài ký tự rác của lớp metadata → vẫn là bản scan", looksScanned("  \n %PDF \n 1 \n"));
check(
  "văn bản đủ dài → KHÔNG phải bản scan",
  !looksScanned("Câu 1. ".repeat(60)),
);

/* ── Đề PDF dựng sẵn đi hết đường parser ──────────────────────────────── */
{
  const doc = [
    "Mã đề 0401 Trang 1/3",
    "PHẦN A: TRẮC NGHIỆM KHÁCH QUAN (7 điểm)",
    "Câu 1. Để nhân giống vô tính ở cây trồng, người ta dùng bộ phận nào?",
    "A. Đỉnh sinh trưởng. B. Lá trưởng thành. C. Hoa và hạt. D. Thân.",
    "Câu 2. Sau một chu kì tế bào từ một tế bào mẹ tạo ra bao nhiêu tế bào con?",
    "A. 2. B. 3. C. 1. D. 4.",
    "--- HẾT ---",
  ].join("\n");
  const text = normalisePdfText(doc);
  check("PDF: bộ nhận dạng kết luận là đề tự soạn", detectImportFormat(text).format === "generic");
  const qs = parseGeneric(text).questions;
  check("PDF: tách đúng 2 câu", qs.length === 2, String(qs.length));
  check("PDF: câu 1 có 4 phương án", qs[0]?.options.length === 4, String(qs[0]?.options.length));
  check(
    "PDF: KHÔNG câu nào tự nhận đáp án đúng (PDF không có gạch chân)",
    qs.every((q) => q.options.every((o) => !o.isCorrect)),
  );
  check(
    "PDF: có cảnh báo phải chọn đáp án tay",
    qs[0]?.warnings.some((w) => /đáp án/i.test(w)),
    JSON.stringify(qs[0]?.warnings),
  );
  check("PDF: dòng số trang không lọt vào đề bài", !/Trang 1/.test(qs[0]?.content ?? ""));
}

/* ── Đề đánh số trần: 1. 2. 3. thay cho "Câu N" ───────────────────────── */
//
// Đề quốc tế (AIMO, SMO) không có chữ "Câu" nào. Bản trước ra thẳng lỗi
// "không nhận ra cấu trúc câu hỏi" — đúng chữ người dùng gặp khi tải AIMO.
{
  const doc = [
    "ASIA INTERNATIONAL MATHEMATICAL OLYMPIAD UNION",
    "Section A – each question carries 4 marks",
    "1. The ratio of the father's age to the daughter's age is 6: 1. How old is the father?",
    "A: 15 B: 30 C: 20 D: 10",
    "2. What is the 1809th digit after the decimal point?",
    "A: 8 B: 7 C: 5 D: 9",
    "3. Find the maximum value of a + b.",
    "A: 50 B: 51 C: 52 D: 53",
  ].join("\n");
  const r = parseGeneric(doc);
  check("đánh số trần: chọn chiến lược so-thu-tu", r.strategy === "so-thu-tu", String(r.strategy));
  check("đánh số trần: tách đúng 3 câu", r.questions.length === 3, String(r.questions.length));
  check(
    "đánh số trần: gỡ số thứ tự khỏi đề bài",
    /^The ratio/.test(r.questions[0]?.content ?? ""),
    r.questions[0]?.content,
  );
  check(
    "đánh số trần: phương án viết A: B: C: D: trên một dòng vẫn tách được",
    r.questions[0]?.options.length === 4,
    String(r.questions[0]?.options.length),
  );
  check(
    "đánh số trần: lời dẫn đầu đề không thành câu hỏi",
    !r.questions.some((q) => /OLYMPIAD UNION/.test(q.content)),
  );
}

// Mốc số là mốc YẾU — không được cướp file đã có mốc mạnh hơn, và không
// được cắt vụn danh sách đánh số nằm TRONG một câu hỏi.
{
  const coMocCau = [
    "Câu 1. [TH][GC] Ghép mỗi quốc gia với thủ đô.",
    "1. Việt Nam → Hà Nội",
    "2. Pháp → Paris",
    "3. Nhật Bản → Tokyo",
  ].join("\n");
  const r = parseGeneric(coMocCau);
  check("có mốc “Câu N” thì KHÔNG dùng mốc số", r.strategy === "cau-n", String(r.strategy));
  check("danh sách ghép cặp không bị cắt thành câu riêng", r.questions.length === 1, String(r.questions.length));

  const chiVaiSoLe = ["Bảng điểm", "1. Hạng nhất", "5. Hạng năm"].join("\n");
  check(
    "vài dòng số lẻ, không thành dãy tăng từ 1 → không nhận là đề",
    parseGeneric(chiVaiSoLe).strategy === null,
    String(parseGeneric(chiVaiSoLe).strategy),
  );
}

/* ── File đề THẬT (bỏ qua nếu máy không có de-mau/) ───────────────────── */
const THAT = "de-mau/3. SHOC 10- DE CHINH THUC.pdf";
const DU_PHONG = "de-mau/3. SHOC 10- DE DU PHONG.pdf";
const file = existsSync(DU_PHONG) ? DU_PHONG : existsSync(THAT) ? THAT : null;
if (!file) {
  console.log("\n(bỏ qua phần file thật — không thấy thư mục de-mau/)");
} else {
  const text = await extractPdfText(Buffer.from(readFileSync(file)));
  check(`${file}: đọc được chữ`, !looksScanned(text), `${text.length} ký tự`);
  const qs = parseGeneric(text).questions;
  // Đề SHOC dự phòng có 12 câu trắc nghiệm + phần Đúng/Sai + trả lời ngắn.
  check(`${file}: tách được ≥ 12 câu`, qs.length >= 12, `${qs.length} câu`);
  check(
    `${file}: câu đầu có đủ 4 phương án`,
    (qs[0]?.options.length ?? 0) === 4,
    JSON.stringify(qs[0]?.options.map((o) => o.content)),
  );
  check(
    `${file}: đề bài câu đầu không rỗng`,
    (qs[0]?.content ?? "").length > 20,
    qs[0]?.content,
  );
}

const AIMO = "de-mau/AIMO 6.1 (1).pdf";
if (existsSync(AIMO)) {
  const text = await extractPdfText(Buffer.from(readFileSync(AIMO)));
  const r = parseGeneric(text);
  check(`${AIMO}: dùng mốc số thứ tự`, r.strategy === "so-thu-tu", String(r.strategy));
  check(`${AIMO}: tách được ≥ 20 câu`, r.questions.length >= 20, `${r.questions.length} câu`);
  check(
    `${AIMO}: câu đầu đủ 4 phương án`,
    r.questions[0]?.options.length === 4,
    JSON.stringify(r.questions[0]?.options.map((o) => o.content)),
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
