#!/usr/bin/env node
/**
 * Đề Word soạn bằng MathType: công thức phải hiện ra được, và phương án
 * A/B/C/D không được biến mất.
 *
 * Chạy:  node scripts/test-mathtype-docx.mjs
 *
 * Vì sao có file này — đề K10.TO.TX1 (Toán 10, trường FPT Hải Phòng) hỏng cả
 * ba tầng cùng lúc, mỗi tầng che tầng sau:
 *
 *  1. File KHÔNG có `<m:oMath>` nào. 81 công thức đều là đối tượng OLE
 *     `Equation.DSMT4` (MathType), nên đường chuyển OMath → `$LaTeX$` không
 *     thấy gì để làm và im lặng bỏ qua.
 *  2. mammoth xuất ảnh xem trước của chúng thành `data:image/x-wmf`. Không
 *     trình duyệt nào vẽ được WMF → giáo viên nhận về một đề đầy ảnh vỡ.
 *     (mammoth có cảnh báo đúng chuyện này nhưng mã nguồn không đọc
 *     `result.messages`, nên cảnh báo bị nuốt.)
 *  3. Mỗi `<img>` bị bọc bằng xuống dòng, nên `B. <công thức> là số chẵn.`
 *     vỡ thành ba dòng: phương án B rỗng, phần chữ rơi vào đề bài. 7/11 câu
 *     báo "Cần ít nhất 2 phương án".
 *
 * Tầng 3 KHÔNG dính gì tới MathType: bất cứ đề nào có ảnh chèn giữa phương án
 * đều mất đáp án như vậy.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-mathtype-"));
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

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass += 1;
    console.log(`✓  ${name}`);
  } else {
    fail += 1;
    console.log(`✗  ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const { fixMetafileGlyphs, inlineWmfAsSvg } = await import(
  bundle("src/features/question-bank/lib/wmf-to-svg.ts", "wmf.mjs")
);
const { inlineMathTypeObjects, applyMathImages } = await import(
  bundle("src/features/question-bank/lib/docx-mathtype.ts", "docxmath.mjs")
);
const { htmlToMarkedText } = await import(
  bundle("src/features/question-bank/lib/parse-exam-bank.ts", "marked.mjs")
);
const { htmlToFscText } = await import(
  bundle("src/features/question-bank/lib/html-to-fsc-text.ts", "fsctext.mjs")
);
const { parseGeneric } = await import(
  bundle("src/features/question-bank/lib/parse-generic.ts", "generic.mjs")
);

/* ── 1. Bảng mã Symbol / MT Extra ─────────────────────────────────────────
 *
 * Bộ dựng WMF giữ nguyên font Symbol cùng mã ký tự kiểu cũ; trình duyệt tra
 * theo Unicode nên `∀x∈ℝ` hiện thành `"x∈¡`. Sai kiểu đó nguy hiểm hơn ảnh
 * vỡ vì nhìn lướt vẫn giống công thức. */
{
  const svg = fixMetafileGlyphs(
    `<text font-family="Symbol" font-size="12">&quot;</text>` +
      `<text font-family="Symbol" font-size="12">$</text>` +
      `<text font-family="MT Extra" font-size="12">¡</text>` +
      `<text font-family="MT Extra" font-size="12">¥</text>`,
  );
  ok("Symbol 0x22 → ∀", svg.svg.includes(">∀<"), svg.svg);
  ok("Symbol 0x24 → ∃", svg.svg.includes(">∃<"), svg.svg);
  ok("MT Extra 0xA1 → ℝ", svg.svg.includes(">ℝ<"), svg.svg);
  ok("MT Extra 0xA5 → ℕ", svg.svg.includes(">ℕ<"), svg.svg);
  ok("không còn font Symbol", !svg.svg.includes('font-family="Symbol"'));
  ok("không còn font MT Extra", !svg.svg.includes('font-family="MT Extra"'));
}
{
  // Chữ Hy Lạp TRÙNG HÌNH với chữ Latin thì trả về Latin — "tam giác ABC"
  // phải tìm kiếm và sao chép được. Chữ khác hình thì giữ nguyên.
  const r = fixMetafileGlyphs(
    `<text font-family="Symbol">ΑΒΧ</text><text font-family="Symbol">ΔΩ</text>`,
  );
  ok("Α Β Χ → A B X", r.svg.includes(">ABX<"), r.svg);
  ok("Δ Ω giữ nguyên (khác hình)", r.svg.includes(">ΔΩ<"), r.svg);
}
{
  // Chữ trong font thường không được đụng vào.
  const r = fixMetafileGlyphs(`<text font-family="Times New Roman">$x"</text>`);
  ok('font thường giữ nguyên `$x"`', r.svg.includes('>$x"<'), r.svg);
}

/* ── 2. Ảnh nằm giữa dòng chữ thì KHÔNG được bẻ dòng ──────────────────── */
{
  const html =
    `<p>Câu 1. Trong các câu sau, câu nào là mệnh đề chứa biến?</p>` +
    `<p><strong>A. </strong>Bạn học lớp nào?</p>` +
    `<p><strong>B. </strong><img src="data:image/png;base64,AAAA"> là số chẵn.</p>`;
  for (const [label, text] of [
    ["khuôn chung", htmlToMarkedText(html)],
    ["khuôn FSC", htmlToFscText(html)],
  ]) {
    const line = text.split("\n").find((l) => l.startsWith("B."));
    ok(
      `${label}: phương án B giữ được cả ảnh lẫn chữ trên một dòng`,
      !!line && line.includes("![](data:image/png") && line.includes("là số chẵn"),
      JSON.stringify(text),
    );
  }
  const q = parseGeneric(htmlToMarkedText(html)).questions[0];
  ok(
    "parser đọc ra phương án B có nội dung",
    !!q && (q.options ?? []).some((o) => o.label === "B" && o.content.trim()),
    JSON.stringify(q?.options),
  );
}
{
  // Ảnh đứng RIÊNG một đoạn thì vẫn phải nằm dòng riêng: đề Toán hay có công
  // thức thả nổi ngay trước dòng "Câu N", dính vào là mất hẳn câu đó.
  const html = `<p>Câu 5. Cho tập hợp:</p><img src="data:image/png;base64,AAAA"><p>Câu 6. Cho hai tập hợp.</p>`;
  const lines = htmlToMarkedText(html).split("\n").filter(Boolean);
  ok(
    "ảnh thả nổi giữa hai đoạn vẫn đứng dòng riêng",
    lines.some((l) => l.trim() === "![](data:image/png;base64,AAAA)") &&
      lines.some((l) => l.startsWith("Câu 6.")),
    JSON.stringify(lines),
  );
}

/* ── 2b. Nhãn "Lời giải" đứng trơ một dòng ────────────────────────────────
 *
 * Đề thật viết đúng vậy, không có dấu hai chấm. Bản cũ đòi dấu nên cả phần
 * giải chảy vào ĐỀ BÀI, còn ô "Giải thích đáp án" trống trơn. */
{
  const html =
    `<p>Câu 9. [TH][DSN] Xét tính đúng sai của các mệnh đề sau:</p>` +
    `<p>a) Tam giác vuông</p><p>b) Tam giác cân</p>` +
    `<p>Lời giải</p><p>a) Đúng. b) Sai.</p>`;
  const q = parseGeneric(htmlToMarkedText(html)).questions[0];
  ok("đề bài KHÔNG nuốt lời giải", !!q && !/Lời giải|Đúng\./.test(q.content), JSON.stringify(q?.content));
  ok("lời giải vào ô giải thích", !!q && /Đúng\./.test(q.explanation ?? ""), JSON.stringify(q?.explanation));
  ok("hai ý Đúng/Sai vẫn được giữ", (q?.subQuestions ?? []).length === 2, JSON.stringify(q?.subQuestions));
}
{
  // "Đáp án" trơ một dòng KHÔNG phải mở đầu lời giải (khuôn khác dùng nó làm
  // nhãn của đáp án), nên phải giữ nguyên hành vi cũ.
  const html = `<p>Câu 1. Thủ đô Việt Nam?</p><p>A. Hà Nội</p><p>B. Huế</p><p>Đáp án</p>`;
  const q = parseGeneric(htmlToMarkedText(html)).questions[0];
  ok("“Đáp án” trơ một dòng vẫn không mở lời giải", !(q?.explanation ?? "").trim(), JSON.stringify(q?.explanation));
}

/* ── 3. File .docx THẬT (bỏ qua nếu máy không có de-mau/) ─────────────── */
const DOCX = "de-mau/K10.TO.TX1.docx";
if (!existsSync(DOCX)) {
  console.log("\n(bỏ qua phần file thật — không thấy de-mau/K10.TO.TX1.docx)");
} else {
  // Giải từ apps/web để bắt được cả khi npm đã kéo gói lên node_modules gốc.
  const req = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const mammoth = req("mammoth");
  const JSZip = req("jszip");
  const katex = req("katex");
  const buf = readFileSync(DOCX);

  const raw = await mammoth.convertToHtml({ buffer: buf }, {
    convertImage: mammoth.images.imgElement(async (image) => ({
      src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
    })),
  });
  ok("đề này không có công thức Word nào", !raw.value.includes("<m:oMath"));
  ok("mammoth trả về ảnh WMF không dùng được", raw.value.includes("data:image/x-wmf"));

  // ── Công thức MathType → LaTeX thật ─────────────────────────────────────
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml").async("string");
  const mt = await inlineMathTypeObjects(zip, docXml);
  ok("đọc được MỌI công thức thành LaTeX (81 MathType + 14 ảnh dán)",
    mt.latexCount === 95, `được ${mt.latexCount}`);
  ok("không còn công thức nào phải để dạng ảnh", mt.imageCount === 0, `còn ${mt.imageCount}`);
  ok("không bỏ sót đối tượng nào", mt.droppedCount === 0, `bỏ ${mt.droppedCount}`);

  const texs = [...mt.docXml.matchAll(/<w:t xml:space="preserve">\$([^$<]+)\$<\/w:t>/g)].map(
    (m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  );
  ok("LaTeX được ghi thẳng vào file Word", texs.length === 95, `${texs.length} chỗ`);
  let bad = 0;
  for (const t of texs) {
    try { katex.renderToString(t, { throwOnError: true }); } catch { bad += 1; }
  }
  ok("KaTeX dựng được MỌI công thức", bad === 0, `${bad} công thức KaTeX từ chối`);
  const all = texs.join(" ");
  ok("có ký hiệu ∀ ∃ ∈ đúng lệnh LaTeX",
    all.includes("\\forall") && all.includes("\\exists") && all.includes("\\in "));
  ok("có tập số ℝ ℕ", all.includes("\\mathbb{R}") && all.includes("\\mathbb{N}"));
  ok("số mũ ra ^{…}", all.includes("^{2}"));
  ok("hệ phương trình ra \\begin{cases}", all.includes("\\begin{cases}"));
  ok("khoảng ra \\left(…\\right)", all.includes("\\left(") && all.includes("\\right)"));
  // Câu 5·6 — chỗ giáo viên báo — là ảnh DÁN, không có dữ liệu MathType; đọc
  // lại bằng hình học của chữ trong ảnh.
  ok("đọc được khoảng trong ảnh dán của câu 5·6",
    all.includes("(1;3]") && all.includes("[-5;+\\infty )") && all.includes("A\\cap B"),
    "thiếu khoảng của câu 5 hoặc 6");
  ok("chữ A B X là Latin, không phải Hy Lạp nhìn giống",
    !/[\u0391\u0392\u03a7]/.test(all), "còn chữ Hy Lạp trùng hình");

  // ── Ảnh dán: phải nằm ĐÚNG chỗ, không bị nhấc ra ngoài đoạn ─────────────
  zip.file("word/document.xml", mt.docXml);
  const pre = await zip.generateAsync({ type: "nodebuffer" });
  const conv = await mammoth.convertToHtml({ buffer: pre }, {
    convertImage: mammoth.images.imgElement(async (image) => ({
      src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
    })),
  });
  const html = applyMathImages(conv.value, mt.images);
  ok("không còn mốc tạm nào sót lại", !html.includes("⟦FSCMATH"));

  const questions = parseGeneric(htmlToMarkedText(html)).questions;
  ok("vẫn tách đủ 11 câu", questions.length === 11, `được ${questions.length}`);
  // Câu 9·10·11 của đề này có khối "Lời giải" — phải nằm ở ô giải thích.
  const solved = questions.filter((q) => (q.explanation ?? "").trim()).length;
  ok("khối Lời giải vào ô giải thích", solved === 3, `${solved} câu có giải thích`);
  ok(
    "không câu nào còn chữ “Lời giải” trong đề bài",
    questions.every((q) => !/Lời giải/.test(q.content)),
  );
  // Đây là lỗi giáo viên báo: câu 4·5·6·8 có công thức thả nổi ngoài đoạn
  // phương án nên A/B/C/D rỗng trơn.
  const empty = questions
    .map((q, i) => [i + 1, (q.options ?? []).filter((o) => !o.content.trim()).length])
    .filter(([, n]) => n > 0);
  ok("không câu nào còn phương án rỗng", empty.length === 0, JSON.stringify(empty));
  const withOpts = questions.filter((q) => (q.options ?? []).length >= 2).length;
  ok("8 câu trắc nghiệm đều có đủ phương án", withOpts === 8, `được ${withOpts}`);

  // ── Lưới an toàn: ảnh WMF lọt tới HTML vẫn phải dựng được ───────────────
  const svg = inlineWmfAsSvg(raw.value);
  ok("dựng lại được ảnh WMF còn sót", svg.failed === 0, `hỏng ${svg.failed}`);
  ok("không gặp ký tự MT Extra lạ", svg.unknownGlyphs.length === 0, svg.unknownGlyphs.join(""));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
