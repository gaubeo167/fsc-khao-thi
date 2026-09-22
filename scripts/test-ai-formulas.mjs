#!/usr/bin/env node
/**
 * Test hồi quy cho bộ dọn công thức PDF bằng AI
 * (apps/web/src/app/api/import/parse-questions/ai-formulas.ts).
 *
 * Chạy:  node scripts/test-ai-formulas.mjs
 *
 * KHÔNG gọi AI thật — test ở đây nhắm vào phần nguy hiểm, và phần nguy hiểm
 * không phải lời nhắc mà là CHỐT KIỂM: cái gì được nhận, cái gì bị vứt.
 *
 * Vì sao chốt kiểm mới là chỗ đáng test: AI được đưa nguyên văn đề thi và
 * được yêu cầu trả lại nguyên văn đó. Nếu nó tóm tắt, dịch, hay bỏ mất vài
 * câu, mà mình cứ nhận, thì đề vào ngân hàng đã bị viết lại bằng chữ của máy
 * — không ai đối chiếu với bản PDF gốc nữa. `isPlausible` là thứ duy nhất
 * đứng giữa hai chuyện đó.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-aif-")), "a.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/app/api/import/parse-questions/ai-formulas.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { isPlausible, maskImages, restoreImages } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const GOC = [
  "Câu 1. Tính giá trị của biểu thức",
  "(1 + 1",
  "3 + 1",
  "9)",
  "A. 13/9 B. 4/3 C. 1 D. 2",
  "Câu 2. Rút gọn phân số sau",
  "12",
  "18",
  "Câu 3. Giải phương trình x + 2 = 5.",
].join("\n");

/* ── Nhận: đúng việc AI được giao ─────────────────────────────────────── */
{
  const dungViec = [
    "Câu 1. Tính giá trị của biểu thức",
    "$(1 + \\frac{1}{3} + \\frac{1}{9})$",
    "A. 13/9 B. 4/3 C. 1 D. 2",
    "Câu 2. Rút gọn phân số sau",
    "$\\frac{12}{18}$",
    "Câu 3. Giải phương trình x + 2 = 5.",
  ].join("\n");
  check("gộp công thức thành $LaTeX$, giữ đủ mốc câu → NHẬN", isPlausible(GOC, dungViec));
}
{
  const yNguyen = GOC;
  check("AI trả lại y nguyên (không có gì để gộp) → NHẬN", isPlausible(GOC, yNguyen));
}

/* ── Vứt: AI làm quá việc được giao ───────────────────────────────────── */
{
  const tomTat = "Đề gồm 3 câu về phân số và phương trình.";
  check("AI tóm tắt cả đề → VỨT", !isPlausible(GOC, tomTat));
}
{
  const matCau = [
    "Câu 1. Tính giá trị của biểu thức",
    "$(1 + \\frac{1}{3} + \\frac{1}{9})$",
    "A. 13/9 B. 4/3 C. 1 D. 2",
    "Câu 2. Rút gọn phân số sau",
    "$\\frac{12}{18}$",
    // Câu 3 biến mất — dạng hỏng nguy hiểm nhất vì bản còn lại nhìn vẫn sạch.
  ].join("\n");
  check("AI làm mất một câu → VỨT", !isPlausible(GOC, matCau));
}
{
  const doiSoCau = GOC.replace("Câu 3.", "Câu 4.");
  check("AI đánh số lại câu → VỨT", !isPlausible(GOC, doiSoCau));
}
{
  check("AI trả về rỗng → VỨT", !isPlausible(GOC, ""));
  check("AI trả về toàn khoảng trắng → VỨT", !isPlausible(GOC, "   \n  \n"));
}

/* ── Không bắt bẻ chuyện nhỏ ──────────────────────────────────────────── */
{
  // Gộp công thức LÀM NGẮN văn bản đi (ba dòng thành một). Chốt kiểm phải
  // chịu được điều đó, nếu không thì nó vứt đúng những lần AI làm tốt nhất.
  const gonHan = [
    "Câu 1. Tính giá trị của biểu thức $(1+\\frac{1}{3}+\\frac{1}{9})$",
    "A. 13/9 B. 4/3 C. 1 D. 2",
    "Câu 2. Rút gọn $\\frac{12}{18}$",
    "Câu 3. Giải phương trình x + 2 = 5.",
  ].join("\n");
  check("gộp công thức làm văn bản ngắn lại → vẫn NHẬN", isPlausible(GOC, gonHan), gonHan);
}
{
  const doiKhoangTrang = GOC.replace(/\n/g, "\n ");
  check("khác nhau mỗi khoảng trắng → NHẬN", isPlausible(GOC, doiKhoangTrang));
}

/* ── Đề đánh số trần (AIMO) cũng phải giữ mốc ─────────────────────────── */
{
  const goc2 = ["1. Find the value of", "(1 + 1", "3)", "2. What is x?"].join("\n");
  const tot = ["1. Find the value of $(1 + \\frac{1}{3})$", "2. What is x?"].join("\n");
  const xau = ["1. Find the value of $(1 + \\frac{1}{3})$"].join("\n");
  check("đề đánh số trần: giữ đủ mốc → NHẬN", isPlausible(goc2, tot));
  check("đề đánh số trần: mất câu 2 → VỨT", !isPlausible(goc2, xau));
}

/* ── Văn bản không có mốc câu nào ─────────────────────────────────────── */
{
  const khongMoc = "Trang bìa đề thi\nSở Giáo dục và Đào tạo";
  check(
    "không có mốc câu → chỉ xét độ dài, không đòi mốc",
    isPlausible(khongMoc, "Trang bìa đề thi\nSở Giáo dục và Đào tạo"),
  );
  check("không có mốc câu nhưng bị cắt cụt → VỨT", !isPlausible(khongMoc, "Trang bìa"));
}

/* ── Ảnh KHÔNG được gửi cho AI ─────────────────────────────────────────
 *
 * Từ khi đường PDF rút được ảnh, mỗi ảnh là một data URI dài hàng chục nghìn
 * ký tự nằm trọn MỘT DÒNG. Bộ cắt đoạn chỉ cắt ở ranh giới dòng, nên cả tấm
 * ảnh đi vào một lượt gọi: model không chép nổi, đoạn đó bị vứt, mà mỗi lượt
 * vẫn mất hàng chục giây. Đề 9 ảnh là màn tải đề quay vòng vài phút.
 */
{
  const anh = `![](data:image/png;base64,${"A".repeat(40000)})`;
  const goc = `Câu 1. Hình nào sau đây?\nA. ${anh}\nB. hai`;
  const { masked, images } = maskImages(goc);
  check("ảnh bị thay bằng mốc ngắn", masked.length < 200, String(masked.length));
  check("giữ lại đủ ảnh", images.length === 1);
  check("không còn data URI nào gửi đi", !masked.includes("data:image"));
  check("chữ quanh ảnh giữ nguyên", masked.includes("Câu 1. Hình nào sau đây?") && masked.includes("B. hai"));
  check("trả ảnh về đúng chỗ", restoreImages(masked, images) === goc);
  // AI có thể đổi khoảng trắng quanh mốc; miễn còn mốc thì ảnh vẫn về.
  check(
    "AI thêm khoảng trắng quanh mốc → ảnh vẫn về",
    restoreImages(masked.replace("⟦IMG0⟧", " ⟦IMG0⟧ "), images).includes(anh),
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
