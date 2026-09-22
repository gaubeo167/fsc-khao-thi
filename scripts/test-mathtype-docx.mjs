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

/* ── 3. File .docx THẬT (bỏ qua nếu máy không có de-mau/) ─────────────── */
const DOCX = "de-mau/K10.TO.TX1.docx";
if (!existsSync(DOCX)) {
  console.log("\n(bỏ qua phần file thật — không thấy de-mau/K10.TO.TX1.docx)");
} else {
  // Giải từ apps/web để bắt được cả khi npm đã kéo gói lên node_modules gốc.
  const mammoth = createRequire(
    new URL("../apps/web/package.json", import.meta.url),
  )("mammoth");
  const { value: html } = await mammoth.convertToHtml(
    { buffer: readFileSync(DOCX) },
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
      })),
    },
  );
  ok("đề này không có công thức Word nào", !html.includes("<m:oMath"));
  ok("mammoth trả về ảnh WMF", html.includes("data:image/x-wmf"));

  const r = inlineWmfAsSvg(html);
  ok("dựng lại được mọi công thức", r.failed === 0, `hỏng ${r.failed}`);
  ok("không còn ảnh WMF nào", !r.html.includes("data:image/x-wmf"));
  ok("không gặp ký tự MT Extra lạ", r.unknownGlyphs.length === 0, r.unknownGlyphs.join(""));

  const svgs = [...r.html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)]
    .map((m) => Buffer.from(m[1], "base64").toString("utf8"));
  const all = svgs.join("");
  ok("có ký hiệu ∀ và ∃ đọc được", all.includes("∀") && all.includes("∃"));
  ok("có tập số ℝ và ℕ đọc được", all.includes("ℝ") && all.includes("ℕ"));
  ok("không lọt ký tự sai của bảng mã cũ", !all.includes("¡") && !all.includes("¥"));
  ok(
    "công thức mang cỡ thật (pt) lấy từ file WMF",
    svgs.every((s) => /<svg[^>]*\swidth="[\d.]+pt"/.test(s)),
  );

  const questions = parseGeneric(htmlToMarkedText(r.html)).questions;
  ok("vẫn tách đủ 11 câu", questions.length === 11, `được ${questions.length}`);
  // Câu 1, 2, 7 có phương án nằm CÙNG đoạn với công thức → phải đủ nội dung.
  const emptyOpts = questions.filter(
    (q, i) => [0, 1, 6].includes(i) && (q.options ?? []).some((o) => !o.content.trim()),
  );
  ok(
    "câu 1 · 2 · 7 không còn phương án rỗng",
    emptyOpts.length === 0,
    `${emptyOpts.length} câu còn rỗng`,
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
