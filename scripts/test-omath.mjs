#!/usr/bin/env node
/**
 * Test hồi quy cho công thức Word (OMath) → LaTeX
 * (apps/web/src/app/api/import/parse/omath-to-latex.ts) và cho mốc `$…$`
 * dùng chung (apps/web/src/lib/math-delimiters.ts).
 *
 * Chạy:  node scripts/test-omath.mjs
 *
 * Vì sao có file này: file AIMO có một khối công thức Word mà nội dung đúng
 * nguyên văn là `$140÷1-70%≈$466`. Tiền đô và phần trăm nằm NGAY TRONG công
 * thức, mà cả hai đều có nghĩa riêng trong LaTeX:
 *
 *   `$` đụng chính dấu dùng làm mốc công thức → công thức bị cắt đôi
 *   `%` mở chú thích LaTeX → nuốt sạch phần còn lại của dòng
 *
 * Người dùng nhìn thấy một thẻ công thức đỏ (LaTeX hỏng) rồi `466$` rơi ra
 * ngoài thành chữ thường.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-omath-"));
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
const { inlineOMathAsLatex } = await import(
  bundle("src/app/api/import/parse/omath-to-latex.ts", "o.mjs")
);
const { mathAnyRe, mathInlineRe } = await import(
  bundle("src/lib/math-delimiters.ts", "d.mjs")
);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/** Dựng một đoạn document.xml tối thiểu chứa một khối công thức. */
const omathXml = (text) =>
  `<w:p><m:oMath><m:r><m:t>${text}</m:t></m:r></m:oMath></w:p>`;
/** Lấy phần chữ của các thẻ <w:t> mà bộ chuyển đổi sinh ra. */
const runText = (xml) =>
  [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");

/* ── Đúng ca người dùng gặp ───────────────────────────────────────────── */
{
  const out = runText(inlineOMathAsLatex(omathXml("$140÷1-70%≈$466")));
  check("dấu đô la trong công thức được thoát thành \\$", out.includes("\\$140"), out);
  check("phần trăm được thoát thành \\%", out.includes("\\%"), out);
  check("÷ vẫn thành \\div", out.includes("\\div"), out);
  check("≈ vẫn thành \\approx", out.includes("\\approx"), out);

  const hits = out.match(mathAnyRe()) ?? [];
  check("cả cụm là MỘT công thức, không bị cắt đôi", hits.length === 1, JSON.stringify(hits));
  check(
    "công thức chứa đủ cả hai số tiền",
    (hits[0] ?? "").includes("140") && (hits[0] ?? "").includes("466"),
    hits[0],
  );
  check(
    "không còn dấu $ trần nào lọt ra ngoài công thức",
    out.replace(mathAnyRe(), "").indexOf("$") === -1,
    JSON.stringify(out.replace(mathAnyRe(), "")),
  );
}

/* ── Các ký tự đặc biệt còn lại ───────────────────────────────────────── */
for (const [ch, esc] of [
  ["&", "\\&"],
  ["#", "\\#"],
  ["_", "\\_"],
]) {
  const out = runText(inlineOMathAsLatex(omathXml(`a${ch}b`)));
  check(`ký tự ${ch} được thoát thành ${esc}`, out.includes(esc), out);
}

/* ── Không phá công thức thường ───────────────────────────────────────── */
{
  const out = runText(inlineOMathAsLatex(omathXml("x×y≥z")));
  check("công thức không có ký tự đặc biệt vẫn nguyên", /\\times/.test(out) && /\\geq/.test(out), out);
  check("chỉ có đúng một cặp mốc", (out.match(mathAnyRe()) ?? []).length === 1, out);
}

/* ── Mốc `$…$` dùng chung ─────────────────────────────────────────────── */
{
  check(
    "mốc chấp nhận \\$ ở giữa",
    "$\\$140\\div \\$466$".match(mathInlineRe())?.length === 1,
    JSON.stringify("$\\$140\\div \\$466$".match(mathInlineRe())),
  );
  check(
    "một dấu $ lẻ giữa câu KHÔNG thành công thức",
    ("Giá 5 $ một cái".match(mathInlineRe()) ?? []).length === 0,
  );
  check(
    "công thức khối $$…$$ vẫn nhận",
    ("$$\\frac{a}{b}$$".match(mathAnyRe()) ?? []).length === 1,
  );
  check(
    "regex sinh mới mỗi lần gọi, không dính lastIndex",
    ("$a$".match(mathInlineRe()) ?? []).length === 1 &&
      ("$a$".match(mathInlineRe()) ?? []).length === 1,
  );
}

/* ── File Word THẬT (bỏ qua nếu máy không có de-mau/) ─────────────────── */
const AIMO = "de-mau/AIMO-7.1 (1).docx";
if (!existsSync(AIMO)) {
  console.log("\n(bỏ qua phần file thật — không thấy de-mau/)");
} else {
  const { execSync } = await import("node:child_process");
  const xml = execSync(`unzip -p "${AIMO}" word/document.xml`, {
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  const out = inlineOMathAsLatex(xml);
  // Định vị bằng `\div` — đó là thứ bộ chuyển đổi sinh ra. Dò theo "140" thì
  // trúng chữ "$140" trong ĐỀ BÀI (chữ thường, không phải công thức).
  const i = out.indexOf("\\div");
  check(`${AIMO}: có sinh ra công thức`, i > 0);
  const jacket = runText(out.slice(Math.max(0, i - 400), i + 400));
  const hits = jacket.match(mathAnyRe()) ?? [];
  check(`${AIMO}: công thức tiền tệ ra đúng MỘT thẻ`, hits.length === 1, JSON.stringify(hits));
  check(
    `${AIMO}: thẻ đó giữ đủ cả hai số tiền`,
    (hits[0] ?? "").includes("140") && (hits[0] ?? "").includes("466"),
    hits[0],
  );
  check(
    `${AIMO}: không còn % trần (sẽ nuốt cả dòng khi render)`,
    !/[^\\]%/.test(hits[0] ?? ""),
    hits[0],
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
