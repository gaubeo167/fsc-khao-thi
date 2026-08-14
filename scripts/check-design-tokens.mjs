#!/usr/bin/env node
/**
 * Bánh cóc cho thang chữ: số chỗ dùng cỡ chữ tự chế CHỈ ĐƯỢC GIẢM.
 *
 * Chạy:  node scripts/check-design-tokens.mjs
 *        node scripts/check-design-tokens.mjs --update   (hạ mốc sau khi di cư)
 *
 * Vì sao là script chứ không phải luật ESLint: repo này không cài ESLint, và
 * kéo cả bộ vào chỉ để có một luật thì 1.826 vi phạm sẵn có sẽ biến config
 * thành một mớ ngoại lệ. Repo đã có quy ước script node độc lập trong
 * scripts/ (test-grade, test-short-answer, test-ai-error) nên đi theo đó.
 *
 * Vì sao là bánh cóc chứ không phải cấm tuyệt đối: DESIGN.md chốt chiến lược
 * "di cư dần" — code cũ để nguyên, code mới bắt buộc dùng utility ngữ nghĩa.
 * Cấm tuyệt đối thì không ai chạy được; bánh cóc thì mốc chỉ đi xuống, và
 * người thêm chỗ tự chế mới sẽ thấy build đỏ ngay.
 *
 * Xem thang chữ chuẩn ở DESIGN.md, mục "Chữ".
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "apps", "web", "src");
const BASELINE_FILE = join(HERE, "design-tokens-baseline.json");

/** Cỡ chữ tự chế: text-[13px], text-[12.5px]… */
const ARBITRARY_SIZE = /text-\[[0-9.]+px\]/g;
/** Nửa pixel: DESIGN.md cấm hẳn, không có mốc, thấy là hỏng. */
const HALF_PIXEL = /text-\[[0-9]+\.5px\]/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Số dòng của một vị trí ký tự. Phải đếm theo OFFSET thật: dùng indexOf sẽ
 *  luôn trả về lần xuất hiện đầu tiên, nên mọi chỗ trong cùng file báo trùng
 *  một số dòng và người sửa đi tìm nhầm chỗ. */
function lineAt(src, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

const files = walk(SRC);
let total = 0;
let halfTotal = 0;
const halfPixelHits = [];
const perFile = new Map();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = f.slice(SRC.length + 1);

  const hits = src.match(ARBITRARY_SIZE) ?? [];
  if (hits.length) {
    total += hits.length;
    perFile.set(rel, hits.length);
  }

  HALF_PIXEL.lastIndex = 0;
  for (let m; (m = HALF_PIXEL.exec(src)); ) {
    halfTotal++;
    halfPixelHits.push(`${rel}:${lineAt(src, m.index)}  ${m[0]}`);
  }
}

let baseline = null;
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
} catch {
  /* chưa có mốc — sẽ tạo bên dưới */
}

if (process.argv.includes("--update") || !baseline) {
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        arbitraryFontSizes: total,
        halfPixelSizes: halfTotal,
        note: "Xem scripts/check-design-tokens.mjs. Hai số này CHỈ ĐƯỢC GIẢM.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Đã ghi mốc: ${total} chỗ text-[Npx], ${halfTotal} chỗ nửa pixel.`);
  process.exit(0);
}

const limit = baseline.arbitraryFontSizes;
const halfLimit = baseline.halfPixelSizes ?? halfTotal;
let failed = false;

console.log(`Cỡ chữ tự chế: ${total} (mốc ${limit})`);
console.log(`Nửa pixel    : ${halfTotal} (mốc ${halfLimit})`);

if (total > limit) {
  failed = true;
  console.log(`\n✗ TĂNG ${total - limit} chỗ so với mốc.`);
  console.log(`  Thang chữ chuẩn nằm ở DESIGN.md, mục "Chữ". Dùng utility ngữ`);
  console.log(`  nghĩa (.text-body, .text-meta, .text-hint, .text-dense…).`);
  console.log(`  Không có vai trò nào vừa? Thêm vào globals.css và cập nhật`);
  console.log(`  bảng trong DESIGN.md, đừng chế tại chỗ.`);
  console.log(`\n  10 file nhiều nhất:`);
  for (const [f, n] of [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${String(n).padStart(4)}  ${f}`);
  }
} else if (total < limit) {
  console.log(`\n✓ Giảm ${limit - total} chỗ. Chạy --update để hạ mốc.`);
} else {
  console.log(`✓ Không tăng.`);
}

// Nửa pixel cũng là bánh cóc, không phải lỗi cứng. Đã có 405 chỗ từ trước;
// bắt lỗi cứng thì không ai chạy xanh được ngay từ ngày đầu, script bị bỏ,
// và ta mất luôn cái chặn cho chỗ MỚI. Đó đúng là bẫy ghi ở đầu file.
if (halfTotal > halfLimit) {
  failed = true;
  console.log(`\n✗ NỬA PIXEL tăng ${halfTotal - halfLimit} chỗ (DESIGN.md cấm hẳn).`);
  for (const h of halfPixelHits.slice(0, 15)) console.log(`    ${h}`);
  if (halfPixelHits.length > 15) console.log(`    … tổng ${halfPixelHits.length} chỗ`);
  console.log(`  Không ai chọn 12,5px từ một thang. Làm tròn về bậc gần nhất.`);
} else if (halfTotal < halfLimit) {
  console.log(`✓ Nửa pixel giảm ${halfLimit - halfTotal} chỗ. Chạy --update để hạ mốc.`);
}

process.exit(failed ? 1 : 0);
