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
import { createRequire } from "node:module";
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
const { layoutPdfPage } = await import(
  bundle("src/app/api/import/parse-questions/pdf-layout.ts", "layout.mjs")
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

/* ── Chữ trong công thức: xếp theo TOẠ ĐỘ và đổi bảng mã font ký hiệu ────
 *
 * Word xuất PDF thì công thức MathType vỡ thành mẩu chữ rời, thứ tự trong file
 * KHÔNG phải thứ tự đọc, và ký hiệu mang mã vùng riêng U+F0xx nên rút ra là
 * ký tự vô hình. Giáo viên thấy "C.  , 1n n n   chia hết cho 2." */
{
  const item = (str, x, y, size, fontKey, width) => ({ str, x, y, size, width: width ?? str.length * size * 0.5, fontKey });
  // ∀ (Symbol 0x22) + n + ∈ (Symbol 0xCE) + ℕ (MT Extra 0xA5)
  const line = [
    item("\uf022", 10, 100, 12, "fSym"),
    item("n", 20, 100, 12, "fTimes"),
    item("\uf0ce", 30, 100, 12, "fSym"),
    item("\uf0a5", 42, 100, 12, "fMt"),
  ];
  const out = layoutPdfPage(line);
  check("PDF: đổi mã Symbol → ∀ và ∈", out.includes("∀") && out.includes("∈"), JSON.stringify(out));
  check("PDF: font chỉ dùng mã cao là MT Extra → ℕ (không phải ∞)", out.includes("ℕ"), JSON.stringify(out));
}
{
  const item = (str, x, y, size, fontKey) => ({ str, x, y, size, width: str.length * size * 0.5, fontKey });
  // Số mũ: chữ nhỏ hơn, nâng cao hơn đường chân chữ — và trong file nó nằm
  // TRƯỚC chữ gốc, nên xếp theo thứ tự file là ra "2x".
  const out = layoutPdfPage([
    item("2", 26, 104, 7, "f1"),
    item("x", 20, 100, 12, "f1"),
    item("+1", 32, 100, 12, "f1"),
  ]);
  check("PDF: số mũ ghép đúng vào chữ gốc", /x²/.test(out.replace(/\s+/g, "")), JSON.stringify(out));
}
{
  const item = (str, x, y, size) => ({ str, x, y, size, width: str.length * size * 0.5, fontKey: "f1" });
  const out = layoutPdfPage([item("dòng dưới", 10, 60, 12), item("dòng trên", 10, 100, 12)]);
  check("PDF: dòng trên xuống trước dòng dưới", out === "dòng trên\ndòng dưới", JSON.stringify(out));
}

/* ── Đề PDF THẬT có công thức MathType (bỏ qua nếu máy không có de-mau/) ── */
{
  const PDF = "de-mau/K10.TO.TX1.pdf";
  if (!existsSync(PDF)) {
    console.log("(bỏ qua phần PDF công thức — không thấy de-mau/K10.TO.TX1.pdf)");
  } else {
    const katex = createRequire(new URL("../apps/web/package.json", import.meta.url))("katex");
    const text = await extractPdfText(readFileSync(PDF));
    check("PDF thật: không còn ký tự vùng riêng vô hình", !/[\uE000-\uF8FF]/.test(text));
    check("PDF thật: đọc được ∀ ∃ ∈", /∀/.test(text) && /∃/.test(text) && /∈/.test(text));
    check("PDF thật: đọc được ℝ và ℕ", /ℝ/.test(text) && /ℕ/.test(text));
    check("PDF thật: số mũ ra ký tự mũ", /²/.test(text));
    const qs = parseGeneric(text).questions;
    check("PDF thật: tách đúng 11 câu", qs.length === 11, String(qs.length));
    const q6 = qs[5];
    check(
      "PDF thật: câu 6 có đủ 4 phương án đọc được",
      (q6?.options ?? []).length === 4 && q6.options.every((o) => /\d/.test(o.content)),
      JSON.stringify(q6?.options?.map((o) => o.content)),
    );

    // ĐÁP ÁN ĐÚNG. Đề đánh dấu bằng GẠCH CHÂN; Word lưu thành thuộc tính của
    // chữ, PDF chỉ còn một nét vẽ rời — khớp lại bằng toạ độ. Đối chiếu với
    // chính bản .docx: 11/11 câu trùng đáp án.
    const KEYS = ["B", "C", "A", "A", "C", "A", "D", "C"];
    const got = qs.slice(0, 8).map((q) => (q.options ?? []).filter((o) => o.isCorrect).map((o) => o.label).join(","));
    check("PDF thật: đọc được đáp án đúng của cả 8 câu trắc nghiệm",
      got.join("") === KEYS.join(""), `${got.join("")} ≠ ${KEYS.join("")}`);
    const tf = qs.slice(8, 10).map((q) => (q.subQuestions ?? []).map((x) => (x.correctAnswer ? "Đ" : "S")).join(""));
    check("PDF thật: đọc được Đúng/Sai của hai câu nhiều ý",
      tf.join("|") === "ĐSĐĐ|SĐSĐ", tf.join("|"));

    // ẢNH. Phương án của dạng "Hình vẽ nào sau đây…" chính là hình.
    const imgCount = (text.match(/!\[\]\(data:image\/png;base64,/g) ?? []).length;
    // 9 chứ không phải 10: hình minh hoạ miền nghiệm bị PDF cắt làm đôi, hai
    // dải xếp khít nhau được ghép lại thành một.
    check("PDF thật: rút được ảnh, hình bị cắt đôi đã ghép lại", imgCount === 9, String(imgCount));

    // Hệ phương trình: trong PDF nó vỡ thành ba dòng rời (dòng trên của hệ,
    // câu văn mang mảnh giữa dấu ngoặc, dòng dưới của hệ).
    const cases = [...text.matchAll(/\$([^$\n]+)\$/g)].map((m) => m[1]);
    check("PDF thật: gộp được hệ phương trình thành \\begin{cases}",
      cases.length >= 3 && cases.every((c) => c.includes("\\begin{cases}")),
      JSON.stringify(cases.slice(0, 3)));
    check("PDF thật: KaTeX dựng được các hệ đó", cases.every((c) => {
      try { katex.renderToString(c, { throwOnError: true }); return true; } catch { return false; }
    }));
    check("PDF thật: câu 7 mang hệ bất phương trình trong đề bài",
      /\\begin\{cases\}3x\+y/.test(qs[6]?.content ?? ""), JSON.stringify(qs[6]?.content?.slice(0, 90)));
    for (const i of [3, 7]) {
      const q = qs[i];
      check(
        `PDF thật: câu ${i + 1} (phương án là hình) có đủ 4 phương án`,
        (q?.options ?? []).length === 4 && q.options.every((o) => o.content.includes("data:image/png")),
        JSON.stringify((q?.options ?? []).map((o) => o.content.slice(0, 20))),
      );
    }
    check("PDF thật: không câu nào còn phương án rỗng",
      qs.every((q) => (q.options ?? []).every((o) => o.content.trim())));
  }
}

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

// Mốc số chỉ mở câu khi đúng SỐ KẾ TIẾP.
//
// Công thức nhiều tầng trong PDF đầy dòng dạng "số + dấu đóng": mẫu số của
// 1/7 rút ra thành dòng "7)". Không ràng buộc thứ tự thì mỗi dòng như vậy cắt
// đôi câu hỏi — file AIMO từng bị xé một biểu thức phân số thành năm "câu",
// bốn trong đó không có đề bài.
{
  const doc = [
    "1. Find the value of the following expression",
    "(1 + 1",
    "3 + 1",
    "5 + 1",
    "7) × (1",
    "3 + 1",
    "5)",
    "A: 15 B: 30 C: 20 D: 10",
    "2. What is x?",
    "A: 1 B: 2 C: 3 D: 4",
    "3. What is y?",
    "A: 1 B: 2 C: 3 D: 4",
  ].join("\n");
  const r = parseGeneric(doc);
  check("phân số nhiều tầng KHÔNG bị cắt thành câu riêng", r.questions.length === 3, `${r.questions.length} câu`);
  check(
    "mọi câu đều có đề bài, không có mảnh rỗng",
    r.questions.every((q) => q.content.trim().length > 5),
    JSON.stringify(r.questions.map((q) => q.content.slice(0, 30))),
  );
  check(
    "câu 1 giữ nguyên các dòng của công thức",
    /7\)/.test(r.questions[0]?.content ?? ""),
    r.questions[0]?.content,
  );
}

// Đề bỏ số (1, 2, 4…) vẫn phải đọc được phần đầu — không đòi dãy hoàn hảo
// tới cuối file, chỉ đòi đúng thứ tự tăng dần.
{
  const doc = [
    "1. Câu một", "A. a B. b",
    "2. Câu hai", "A. a B. b",
    "3. Câu ba", "A. a B. b",
    "5. Câu năm bị bỏ số 4", "A. a B. b",
  ].join("\n");
  const r = parseGeneric(doc);
  check("số nhảy cóc: ba câu đầu vẫn tách đúng", r.questions.length >= 3, `${r.questions.length} câu`);
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
    `${AIMO}: KHÔNG câu nào có đề bài rỗng`,
    r.questions.every((q) => q.content.trim().length >= 15),
    JSON.stringify(
      r.questions.filter((q) => q.content.trim().length < 15).map((q) => q.content),
    ),
  );
  check(
    `${AIMO}: câu đầu đủ 4 phương án`,
    r.questions[0]?.options.length === 4,
    JSON.stringify(r.questions[0]?.options.map((o) => o.content)),
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
