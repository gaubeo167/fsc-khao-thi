#!/usr/bin/env node
/**
 * Test hồi quy cho XSS ở bộ render công thức toán
 * (apps/web/src/features/question-bank/components/math.tsx).
 *
 * Chạy:  node scripts/test-math-xss.mjs
 *
 * LỖ HỔNG GỐC (tìm được 2026-08-14):
 *
 * `Math` gọi katex.renderToString trong try/catch, và nhánh catch trả về
 * `{ html: tex }` — chuỗi LaTeX THÔ — rồi đẩy vào dangerouslySetInnerHTML.
 * Component này nằm dưới RenderedContent, thứ mà exam-runtime.tsx và
 * question-renderer.tsx dùng để hiển thị đề bài, nên payload chạy trong
 * trình duyệt HỌC SINH ĐANG THI.
 *
 * Chuỗi khai thác:
 *   tex = '{'.repeat(60000) + '<img src=x onerror=…>'
 *   → KaTeX ném RangeError (đệ quy quá sâu). Đây KHÔNG phải ParseError nên
 *     throwOnError:false không đỡ được.
 *   → catch trả tex thô → innerHTML → thẻ img chạy onerror.
 *
 * Bốn kiểu dữ liệu không phải chuỗi (undefined/null/số/object) cũng làm
 * KaTeX ném TypeError và rơi vào đúng nhánh đó.
 *
 * File này khoá lại HAI điều:
 *   1. Đường thành công của KaTeX vẫn escape đúng (đừng vì sợ mà bỏ tính
 *      năng hiển thị lỗi cú pháp).
 *   2. math.tsx KHÔNG còn đường nào đưa chuỗi chưa render vào innerHTML.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MATH_TSX = join(ROOT, "apps/web/src/features/question-bank/components/math.tsx");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
  cond ? pass++ : fail++;
};

const PAYLOAD = "<img src=x onerror=alert(1)>";
const LIVE_TAG = /<img[^>]*onerror/i;

// ── Phần 1: hành vi thật của KaTeX với đúng options mà math.tsx dùng ──
// Dùng bản DỰNG SẴN của katex, không bundle từ source: source có biến
// build-time (__VERSION__) chưa được thay nên import thẳng sẽ nổ.
const katex = createRequire(import.meta.url)(join(ROOT, "node_modules/katex"));
const OPTS = { displayMode: false, throwOnError: false, strict: "ignore", output: "html", trust: false };

const render = (tex) => {
  try { return { html: katex.renderToString(tex, OPTS), threw: false }; }
  catch { return { html: null, threw: true }; }
};

// Lỗi cú pháp LaTeX: KaTeX tự escape, KHÔNG được ném.
{
  const r = render(`${PAYLOAD} \\frac{1}{`);
  ok("LaTeX hỏng + payload: KaTeX không ném", r.threw === false);
  ok("LaTeX hỏng + payload: output đã escape", !LIVE_TAG.test(r.html ?? ""));
  ok("LaTeX hỏng + payload: có &lt;img", (r.html ?? "").includes("&lt;img"));
}

// Các input LÀM KaTeX NÉM — đây là nhánh từng rò rỉ.
const throwers = [
  ["lồng sâu 60k dấu {", "{".repeat(60000)],
  ["lồng sâu + payload", "{".repeat(60000) + PAYLOAD],
  ["undefined", undefined],
  ["null", null],
  ["số", 42],
  ["object có toString độc", { toString: () => PAYLOAD }],
];
for (const [name, tex] of throwers) {
  ok(`KaTeX NÉM với ${name} → phải rơi vào nhánh dự phòng`, render(tex).threw === true);
}

// ── Phần 2: math.tsx không còn đường nào đưa chuỗi thô vào innerHTML ──
const src = readFileSync(MATH_TSX, "utf8");

ok(
  "math.tsx: nhánh catch KHÔNG trả `html: tex`",
  !/catch\s*\{[^}]*html:\s*tex/s.test(src),
  "→ nhánh lỗi lại đang trả tex thô",
);
ok(
  "math.tsx: mọi dangerouslySetInnerHTML đều dùng result.html, không dùng tex",
  [...src.matchAll(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+?)\s*\}\}/g)]
    .every((m) => /result\.html/.test(m[1]) && !/\btex\b/.test(m[1])),
  "→ có chỗ nhét thẳng tex vào innerHTML",
);
ok(
  "math.tsx: có chặn sớm kiểu dữ liệu không phải chuỗi",
  /typeof\s+tex\s*!==\s*["']string["']/.test(src),
);
ok(
  "math.tsx: nhánh lỗi render tex như văn bản thuần (React tự escape)",
  /\{String\(tex\)\}/.test(src),
);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
