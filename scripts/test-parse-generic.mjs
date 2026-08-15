#!/usr/bin/env node
/**
 * Test hồi quy cho parser đề TỰ SOẠN (apps/web/src/features/question-bank/lib/parse-generic.ts).
 *
 * Chạy:  node scripts/test-parse-generic.mjs
 *
 * Vì sao có file này: đưa ba file đề THẬT vào hai parser cũ thì cả ba ra 0
 * câu, dù cả ba đều có cấu trúc rõ ràng. Mỗi ca dưới khoá lại đúng một cái
 * bẫy đã làm parser trượt, ghi bằng chuỗi tái dựng từ file thật — KHÔNG kèm
 * đề thật vào repo (đề nằm trong de-mau/, đã .gitignore).
 *
 * Ký hiệu ⟦U⟧…⟦/U⟧ là dấu gạch chân do bộ trích xuất docx sinh ra; gạch chân
 * = đáp án đúng theo quy ước người soạn.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-generic-")), "g.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/parse-generic.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { parseGeneric } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const U = "⟦U⟧";
const Uc = "⟦/U⟧";

/* ── Khuôn SHOC: `Câu N. [mã] đề` + phương án gạch chân CHỈ ở chữ cái ── */
{
  const doc = [
    "Câu 1. [SI10.02.15.D01] Thành tựu nào sau đây là kết quả của công nghệ tế bào động vật?",
    `${U}A${Uc}. Sản xuất giống vi khuẩn tái tổ hợp.`,
    "B. Lai tạo giữa bò và lợn.",
    "C. Nhân bản vô tính cừu Dolly.",
    "D. Tạo ra giống lúa chịu hạn tốt.",
  ].join("\n");
  const r = parseGeneric(doc);
  const q = r.questions[0];
  check("SHOC: chia câu theo mốc `Câu N`", r.strategy === "cau-n", r.strategy);
  check("SHOC: tách được 1 câu", r.questions.length === 1, `ra ${r.questions.length}`);
  check(
    "SHOC: đọc mã chuyên đề nằm GIỮA dòng",
    q?.chuyenDeCode === "SI10.02.15",
    q?.chuyenDeCode,
  );
  check(
    "SHOC: mốc `Câu 1.` và mã bị gỡ khỏi đề bài",
    q?.content.startsWith("Thành tựu nào"),
    q?.content?.slice(0, 40),
  );
  check("SHOC: đủ 4 phương án", q?.options.length === 4, `ra ${q?.options.length}`);
  // Cái bẫy: gạch chân bọc ĐÚNG chữ cái, dấu chấm nằm NGOÀI ⟦/U⟧. Mọi cách dò
  // bằng regex trên chuỗi còn ký hiệu đều trượt ở đây.
  check(
    "SHOC: nhận đáp án đúng khi gạch chân chỉ bọc chữ cái",
    q?.options[0]?.isCorrect === true &&
      q?.options.filter((o) => o.isCorrect).length === 1,
    JSON.stringify(q?.options.map((o) => o.isCorrect)),
  );
  check(
    "SHOC: nội dung phương án không dính nhãn",
    q?.options[0]?.content === "Sản xuất giống vi khuẩn tái tổ hợp.",
    q?.options[0]?.content,
  );
}

/* ── Khuôn SHOC 2: hai phương án CHUNG một dòng, cách nhau bằng tab ── */
{
  const doc = [
    "Câu 3. Chọn phát biểu đúng?",
    "A. Phương án một.\tB. Phương án hai.",
    "C. Phương án ba.\tD. Phương án bốn.",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check(
    "SHOC: hai phương án chung một dòng tách bằng tab",
    q?.options.length === 4,
    `ra ${q?.options.length}`,
  );
  check(
    "SHOC: nhãn ra đúng A B C D",
    q?.options.map((o) => o.label).join("") === "ABCD",
    q?.options.map((o) => o.label).join(""),
  );
}

/* ── Khuôn AIMO: không có chữ "Câu", phương án `A:` thụt MỘT dấu cách ── */
{
  const doc = [
    "ASIA INTERNATIONAL MATHEMATICAL OLYMPIAD UNION",
    "Time allowed: 70 minutes",
    `${U}Section A – each question carries 4 marks ${Uc}`,
    "A jacket is on sale for 70% of the original price. If the discount saves $140, what was the original price?",
    " A: $466",
    "  B: $200",
    "  C: $400",
    "  D: $240",
    "Solution:",
    "The original price of the jacket is 466.",
  ].join("\n");
  const r = parseGeneric(doc);
  const q = r.questions[0];
  check(
    "AIMO: chia câu theo khối lời giải",
    r.strategy === "solution-block",
    r.strategy,
  );
  // Cái bẫy: phương án A thụt MỘT dấu cách còn B/C/D hai dấu. Bản đòi "đầu
  // dòng hoặc 2+ dấu cách" làm A trượt ở MỌI câu của file này.
  check("AIMO: đủ 4 phương án kể cả A thụt 1 dấu cách", q?.options.length === 4, `ra ${q?.options.length}`);
  check(
    "AIMO: đầu đề (tên tổ chức, thời gian) không lọt vào đề bài",
    q?.content.startsWith("A jacket is on sale"),
    q?.content?.slice(0, 50),
  );
  check(
    "AIMO: lời giải vào đúng ô giải thích",
    (q?.explanation ?? "").includes("466"),
    q?.explanation,
  );
  // Đề này KHÔNG đánh dấu đáp án — parser phải để trống chứ không đoán.
  check(
    "AIMO: không đánh dấu đáp án thì để TRỐNG, không đoán",
    q?.options.every((o) => !o.isCorrect),
    JSON.stringify(q?.options.map((o) => o.isCorrect)),
  );
}

/* ── Khuôn nội bộ: `Câu N [NB]` + `Đề bài:` + phương án RỖNG (công thức) ── */
{
  const doc = [
    "Câu 1 [NB]",
    "Đề bài: Đạo hàm của $f(x)=x^2$ bằng?",
    "A. $x$",
    `${U}B.${Uc} $2x$`,
    "C. $x^2$",
    "D. $0$",
    "Giải thích: Áp dụng công thức luỹ thừa.",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check("Nội bộ: đọc mức độ từ nhãn [NB]", q?.difficulty === "easy", q?.difficulty);
  check("Nội bộ: gỡ nhãn `Đề bài:`", q?.content.startsWith("Đạo hàm"), q?.content);
  check("Nội bộ: đủ 4 phương án", q?.options.length === 4, `ra ${q?.options.length}`);
  check(
    "Nội bộ: gạch chân bọc cả `B.` vẫn nhận đúng đáp án B",
    q?.options[1]?.isCorrect === true,
    JSON.stringify(q?.options.map((o) => o.isCorrect)),
  );
}

/* ── Không được cắt nhầm chữ cái trong câu văn thành phương án ── */
{
  const doc = [
    "Câu 1. Theo A. Einstein thì thời gian là tương đối. Phát biểu nào đúng?",
    "A. Đúng.",
    "B. Sai.",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check(
    "Không cắt `A. Einstein` giữa câu văn thành phương án",
    q?.options.length === 2,
    `ra ${q?.options.length}: ${JSON.stringify(q?.options.map((o) => o.content))}`,
  );
}

/* ── File không có mốc nào: phải trả rỗng, KHÔNG đoán bừa ── */
{
  const r = parseGeneric("Một đoạn văn bản bất kỳ.\nKhông có câu hỏi nào ở đây.");
  check("Không có mốc chia câu → trả rỗng, không đoán", r.questions.length === 0 && r.strategy === null);
}

/* ── Chữ LOẠI trong mã YCCĐ quyết định dạng câu ── */
{
  // Câu Đúng/Sai và trả lời ngắn KHÔNG có A/B/C/D nào để đếm. Bỏ chữ loại
  // trong mã thì đúng những câu đó ra "chưa nhận ra dạng" dù đề ghi rõ.
  // Trên đề SHOC thật: 9/21 câu bị như vậy trước khi sửa.
  const mk = (letter) =>
    parseGeneric(
      [`Câu 1. [SI10.02.15.${letter}01] Nội dung câu hỏi?`].join("\n"),
    ).questions[0];
  check("mã .F → Đúng/Sai nhiều ý", mk("F")?.typeLetter === "F", mk("F")?.typeLetter);
  check("mã .S → trả lời ngắn", mk("S")?.typeLetter === "S", mk("S")?.typeLetter);
  check("mã .E → tự luận", mk("E")?.typeLetter === "E", mk("E")?.typeLetter);
  check("mã .D → trắc nghiệm", mk("D")?.typeLetter === "D", mk("D")?.typeLetter);
  check(
    "không có mã thì không bịa chữ loại",
    parseGeneric("Câu 1. Nội dung?\nA. x\nB. y").questions[0]?.typeLetter === null,
  );
}

/* ── Ảnh phải bám đúng câu, không rơi mất ── */
{
  const doc = [
    "Câu 1. Hình bên mô tả quá trình nào?",
    "![](data:image/png;base64,AAAA)",
    "A. Cách một.",
    "B. Cách hai.",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check(
    "ảnh nằm trong đề bài của đúng câu",
    /!\[\]\(data:image\/png;base64,AAAA\)/.test(q?.content ?? ""),
    q?.content?.slice(0, 60),
  );
  check("ảnh không bị hiểu nhầm thành phương án", q?.options.length === 2, `ra ${q?.options.length}`);
}

/* ── Route phải NỐI parser, không chỉ nối bộ nhận dạng ── */
{
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(
    "apps/web/src/app/api/import/parse-questions/route.ts",
    "utf8",
  );
  // Lỗi đã xảy ra thật trên production: bộ nhận dạng biết "đây là đề tự
  // soạn", nhưng route không có nhánh nào gọi parseGeneric nên vẫn chạy
  // parser FSC và trả 0 câu. Người dùng nhận đúng câu vô lý nhất: "Nhận ra
  // file theo Đề tự soạn nhưng không tách được câu hỏi nào."
  check(
    'route có nhánh dispatch cho khuôn "generic"',
    /detect\.format === "generic"[\s\S]{0,200}parseGeneric\(/.test(route),
    "nhận dạng ra khuôn mà không gọi parser tương ứng → 0 câu, lỗi im lặng",
  );
  check(
    "route lùi về parser tổng quát khi parser chuyên dụng ra 0 câu",
    /questions\.length === 0 && detect\.format !== "generic"[\s\S]{0,300}parseGeneric\(/.test(
      route,
    ),
    "file khai theo mẫu FSC mà thiếu trường bắt buộc sẽ chết oan",
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
