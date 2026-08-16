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

// `draftFromGeneric` quyết định DẠNG CÂU cuối cùng từ những gì parser đọc
// được, nên phần nhãn `[TN]/[DS]/…` phải kiểm qua đây mới đúng chỗ.
const outDraft = join(mkdtempSync(join(tmpdir(), "fsc-draft-")), "d.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/import-draft.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${outDraft}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { draftFromGeneric } = await import(outDraft);

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

/* ── Câu Đúng/Sai (mã .F): tách ý con a) b) c) d) ── */
{
  // Nhãn `a)` đứng MỘT MÌNH, câu chữ nằm dòng dưới — kiểu trình bày rất phổ
  // biến trong đề Word. Không xử lý thì mọi ý ra rỗng và câu nào cũng báo
  // "Cần ít nhất 2 ý Đúng/Sai" dù đề viết đủ.
  const doc = [
    "Câu 14. [SI10.02.12.F03] Các nhận định sau đúng hay sai?",
    "a)",
    "Nhận định thứ nhất, sai.",
    "b)",
    `${U}Nhận định thứ hai, đúng.${Uc}`,
    "c) Nhận định thứ ba viết cùng dòng, sai.",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check("F: tách được 3 ý", q?.subQuestions.length === 3, `ra ${q?.subQuestions.length}`);
  check(
    "F: nhãn `a)` đứng riêng thì lấy nội dung ở dòng dưới",
    q?.subQuestions[0]?.statement === "Nhận định thứ nhất, sai.",
    q?.subQuestions[0]?.statement,
  );
  check(
    "F: gạch chân ở dòng nội dung = ý Đúng",
    q?.subQuestions[1]?.correctAnswer === true &&
      q?.subQuestions[0]?.correctAnswer === false,
    JSON.stringify(q?.subQuestions.map((x) => x.correctAnswer)),
  );
  check(
    "F: ý viết cùng dòng với nhãn vẫn nhận",
    q?.subQuestions[2]?.statement === "Nhận định thứ ba viết cùng dòng, sai.",
    q?.subQuestions[2]?.statement,
  );
  check(
    "F: ý con KHÔNG bị hiểu nhầm thành phương án trắc nghiệm",
    q?.options.length === 0,
    `ra ${q?.options.length} phương án`,
  );
}

/* ── Câu trả lời ngắn (mã .S): đọc <Key=…> ── */
{
  const doc = [
    "Câu 15. [SI10.02.12.S05] Nhóm ban đầu có bao nhiêu tế bào?",
    "<KEY=3>",
  ].join("\n");
  const q = parseGeneric(doc).questions[0];
  check("S: lấy được đáp án từ <Key=…>", q?.acceptedAnswers.length === 1, JSON.stringify(q?.acceptedAnswers));
  check("S: đáp án đúng giá trị", q?.acceptedAnswers[0] === "3", JSON.stringify(q?.acceptedAnswers[0]));
  check(
    "S: chuỗi <KEY=…> KHÔNG còn sót trong đề bài",
    !/KEY=/i.test(q?.content ?? ""),
    q?.content,
  );
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

/* ── Nhãn [mức độ][dạng câu] của đề KHÔNG dùng mã YCCĐ ──────────────────
 *
 * Không có mã YCCĐ thì hệ thống chỉ còn cách ĐẾM phương án để đoán dạng.
 * Đếm được với trắc nghiệm, nhưng Đúng/Sai, trả lời ngắn và tự luận không có
 * A/B/C/D nào để đếm — nên trước đây chúng luôn ra "chưa nhận ra dạng".
 */
{
  const draft = (doc) => {
    const q = parseGeneric(doc).questions[0];
    return { q, d: draftFromGeneric(q, 0) };
  };

  {
    const { q, d } = draft(
      [
        "Câu 1. [NB][TN] Thủ đô của Việt Nam là thành phố nào?",
        `${U}A${Uc}. Hà Nội`,
        "B. Huế",
        "C. Đà Nẵng",
        "D. Cần Thơ",
      ].join("\n"),
    );
    check("[NB] → mức độ nhận biết", q?.difficulty === "easy", q?.difficulty);
    check("[TN] → trắc nghiệm một đáp án", d.type === "mcq-single", String(d.type));
    check(
      "nhãn bị GỠ khỏi đề bài, không sót [NB][TN]",
      !/\[(NB|TN)\]/.test(q?.content ?? ""),
      q?.content,
    );
    check("đề bài giữ nguyên chữ", /Thủ đô của Việt Nam/.test(q?.content ?? ""));
  }

  {
    const { q, d } = draft(
      [
        "Câu 2. [TH][DSN] Xét các phát biểu sau:",
        `a) ${U}Phát biểu đúng${Uc}`,
        "b) Phát biểu sai",
        "c) Phát biểu thứ ba",
        "d) Phát biểu thứ tư",
      ].join("\n"),
    );
    check("[DSN] → Đúng/Sai nhiều ý", d.type === "multi-tf", String(d.type));
    check("[DSN] tách được 4 ý con", q?.subQuestions.length === 4, String(q?.subQuestions.length));
    check("[DSN] ý gạch chân = Đúng", q?.subQuestions[0]?.correctAnswer === true);
    check("[DSN] ý không gạch = Sai", q?.subQuestions[1]?.correctAnswer === false);
    check("[TH] → mức thông hiểu", q?.difficulty === "medium", q?.difficulty);
  }

  {
    const { q, d } = draft(
      ["Câu 3. [VD][TLN] Kết quả phép tính là bao nhiêu?", "<Key=42>"].join("\n"),
    );
    check("[TLN] → trả lời ngắn", d.type === "short-answer", String(d.type));
    check("[TLN] vẫn lấy được đáp án <Key=…>", q?.acceptedAnswers[0] === "42");
    check("[VD] → mức vận dụng", q?.difficulty === "hard", q?.difficulty);
  }

  {
    const { d } = draft("Câu 4. [VD][TL] Trình bày quan điểm của em về vấn đề trên.");
    check("[TL] → tự luận, dù câu KHÔNG có phương án nào", d.type === "essay", String(d.type));
  }

  {
    const { d } = draft(
      [
        "Câu 5. [TH][TNN] Những phương án nào đúng?",
        `${U}A${Uc}. Đúng thứ nhất`,
        `${U}B${Uc}. Đúng thứ hai`,
        "C. Sai",
        "D. Sai nữa",
      ].join("\n"),
    );
    check("[TNN] → trắc nghiệm nhiều đáp án", d.type === "mcq-multi", String(d.type));
  }

  // Cách viết mà người soạn sẽ dùng thật, phải nhận hết.
  const dangCau = (tag) =>
    draft([`Câu 1. ${tag} Nội dung`, "A. một", "B. hai"].join("\n")).d.type;
  check("viết gộp [NB-TN]", dangCau("[NB-TN]") === "mcq-single");
  check("viết gộp [NB/TN]", dangCau("[NB/TN]") === "mcq-single");
  check("viết gộp [NB TN]", dangCau("[NB TN]") === "mcq-single");
  check("đảo thứ tự [TN][NB]", dangCau("[TN][NB]") === "mcq-single");
  check("chữ thường [nb][tln]", dangCau("[nb][tln]") === "short-answer");
  check("[ĐSN] viết bằng chữ Đ", dangCau("[ĐSN]") === "multi-tf");
  // DS là MỘT mệnh đề Đúng/Sai, DSN là câu nhiều ý a/b/c/d — hai cách chấm
  // khác nhau nên hai mã khác nhau.
  check("[DS] là Đúng/Sai một mệnh đề", dangCau("[DS]") === "true-false");
  check("chữ tắt một ký tự [F] dùng chung với mã YCCĐ", dangCau("[F]") === "multi-tf");
  check("chữ tắt [E]", dangCau("[E]") === "essay");
  check("[VDC] xếp chung vào vận dụng", (() => {
    const { q } = draft("Câu 1. [VDC][TL] Nội dung");
    return q?.difficulty === "hard";
  })());

  // Không được ăn mất ngoặc vuông của người soạn.
  {
    const { q } = draft(
      ["Câu 1. [NB][TN] Xem hình [Hình 2] và bảng [1] rồi trả lời:", "A. một", "B. hai"].join("\n"),
    );
    check(
      "ngoặc vuông lạ ([Hình 2], [1]) được GIỮ NGUYÊN trong đề bài",
      /\[Hình 2\]/.test(q?.content ?? "") && /\[1\]/.test(q?.content ?? ""),
      q?.content,
    );
  }

  // Nhãn của người soạn thắng việc đếm phương án — họ ghi ra là có ý.
  {
    const { d } = draft(
      ["Câu 1. [NB][TLN] Câu này ghi rõ là trả lời ngắn", "A. một", "B. hai"].join("\n"),
    );
    check("nhãn dạng câu thắng việc đếm phương án", d.type === "short-answer", String(d.type));
  }

  // Đề vẫn nhập được khi thiếu nhãn — chỉ là phải chọn tay.
  {
    const { q, d } = draft(["Câu 1. Không có nhãn nào cả", "A. một", "B. hai"].join("\n"));
    check("thiếu nhãn: mức độ để TRỐNG chứ không đoán", q?.difficulty === null);
    check("thiếu nhãn: vẫn đếm phương án ra trắc nghiệm", d.type === "mcq-single");
  }
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
