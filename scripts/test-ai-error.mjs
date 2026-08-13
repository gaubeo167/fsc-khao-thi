#!/usr/bin/env node
/**
 * Test hồi quy cho phân loại lỗi AI (apps/web/src/lib/ai/classify-error.ts).
 *
 * Chạy:  node scripts/test-ai-error.mjs
 *
 * Vì sao có file này: route `/api/ai/*` trả 401 cho HAI tình huống khác hẳn
 * nhau — `verifyCaller` từ chối người gọi (`{error:"unauthorized"}`) và nhà
 * cung cấp AI từ chối API key (`{error:"ai_failed"}`). Bản cũ chỉ nhìn HTTP
 * status nên học sinh có token hết hạn bị báo "Cấu hình AI API key chưa đúng
 * — kiểm tra ANTHROPIC_API_KEY / GEMINI_API_KEY trên Vercel": chẩn đoán sai,
 * đồng thời lộ tên biến môi trường cho học sinh. Các ca dưới khoá lại việc
 * hai tình huống đó không bao giờ bị gộp làm một nữa.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-aierr-")), "m.mjs");
execFileSync(
  "npx",
  ["esbuild", "src/lib/ai/classify-error.ts", "--bundle", "--format=esm",
   "--platform=node", `--outfile=${out}`],
  { cwd: "apps/web", stdio: "pipe" },
);
const { classifyAiError } = await import(out);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}: ${got}${ok ? "" : ` (mong đợi ${want})`}`);
  ok ? pass++ : fail++;
};

// ── Ca người dùng gặp: phiên đăng nhập hết hạn, KHÔNG phải lỗi API key ──
eq(
  '401 {error:"unauthorized"} → session',
  classifyAiError(401, { error: "unauthorized", message: "ID token không hợp lệ." }),
  "session",
);
eq(
  '403 {error:"forbidden"} → session',
  classifyAiError(403, { error: "forbidden", message: "Không tìm thấy hồ sơ người dùng." }),
  "session",
);

// ── Lỗi cấu hình key thật: chỉ khi chính lời gọi AI bị từ chối ──
eq(
  '401 {error:"ai_failed"} → config',
  classifyAiError(401, { error: "ai_failed", message: "invalid x-api-key" }),
  "config",
);
eq(
  '403 {error:"ai_failed"} → config',
  classifyAiError(403, { error: "ai_failed", message: "API key not valid" }),
  "config",
);

// ── Quá tải: phải thắng mọi nhánh khác vì đây là nhánh duy nhất auto-retry ──
eq("429 → overload", classifyAiError(429, { error: "ai_failed" }), "overload");
eq("503 → overload", classifyAiError(503, { error: "ai_failed" }), "overload");
eq("529 → overload", classifyAiError(529, { error: "ai_failed" }), "overload");
eq(
  '500 + message "Overloaded" → overload',
  classifyAiError(500, { error: "ai_failed", message: "Overloaded" }),
  "overload",
);
eq(
  '401 + message "high demand" → overload (xét trước session)',
  classifyAiError(401, { error: "unauthorized", message: "high demand" }),
  "overload",
);

// ── Phần còn lại ──
eq("500 {error:'unknown'} → other", classifyAiError(500, { error: "unknown", message: "x" }), "other");
eq("400 body sai → other", classifyAiError(400, { error: "bad_request" }), "other");

// ── Body thiếu / lạ: 401 nghiêng về phiên đăng nhập. Đoán sai hướng đó thì
//    vô hại; đổ cho "sai API key" thì admin đi lục biến môi trường vô ích. ──
eq("401 body rỗng → session", classifyAiError(401, {}), "session");
eq("401 body null → session", classifyAiError(401, null), "session");
eq("401 body là chuỗi → session", classifyAiError(401, "nope"), "session");
eq("401 body undefined → session", classifyAiError(401, undefined), "session");
eq("500 body null → other", classifyAiError(500, null), "other");

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
