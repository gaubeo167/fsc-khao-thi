#!/usr/bin/env node
/**
 * Test hồi quy cho dòng xem trước trong danh sách câu hỏi
 * (apps/web/src/features/question-bank/lib/preview-text.ts).
 *
 * Chạy:  node scripts/test-preview-text.mjs
 *
 * Vì sao có file này: QA trên trình duyệt thấy danh sách bên trái của màn
 * nhập đề in nguyên cú pháp nội bộ ra cho người soạn đọc —
 *
 *     Thủ đô của Việt Nam là [blank:1]. Quốc kỳ có [blank:2] ngôi sao vàng.
 *
 * Ô soạn thảo đổi các mốc đó thành thẻ bấm được, danh sách thì không. Nặng
 * nhất là ảnh: một `![](data:image/png;base64,…)` dài hàng chục nghìn ký tự
 * đủ nuốt trọn dòng xem trước.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-prev-")), "p.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/preview-text.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { previewText } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Đúng ca QA bắt được ──────────────────────────────────────────────── */
{
  const got = previewText(
    "Thủ đô của Việt Nam là [blank:1]. Quốc kỳ Việt Nam có [blank:2] ngôi sao vàng.",
  );
  check("ô trống hiện thành ___ chứ không phải [blank:1]", !/\[blank/.test(got), got);
  check("ô trống hiện đúng ký hiệu người soạn quen", got.includes("___"), got);
  check("giữ nguyên chữ quanh ô trống", /Thủ đô của Việt Nam/.test(got) && /ngôi sao vàng/.test(got), got);
}

/* ── Các mốc còn lại ──────────────────────────────────────────────────── */
check("vùng thả", !/\[zone/.test(previewText("Kéo vào [zone:1] và [zone:2]")));
check(
  "cụm gạch chân giữ lại CHỮ, bỏ mốc",
  previewText("Con [u:mèo] nằm trên [u:ghế]") === "Con mèo nằm trên ghế",
  previewText("Con [u:mèo] nằm trên [u:ghế]"),
);
check("video", previewText("Xem [video:https://x.mp4|clip]").includes("🎬"));
check("audio", previewText("Nghe [audio:https://x.mp3|bài]").includes("🔊"));

/* ── Ảnh base64: ca nguy hiểm nhất ────────────────────────────────────── */
{
  const anh = "![](data:image/png;base64," + "A".repeat(40000) + ")";
  const got = previewText(`Quan sát hình ${anh} rồi trả lời.`);
  check("ảnh base64 không lọt vào dòng xem trước", got.length < 60, `${got.length} ký tự`);
  check("ảnh thành biểu tượng", got.includes("🖼"), got);
  check("chữ hai bên ảnh còn nguyên", /Quan sát hình/.test(got) && /rồi trả lời/.test(got), got);
}

/* ── Công thức ────────────────────────────────────────────────────────── */
{
  const got = previewText("Tính $\\frac{1}{3} + \\frac{1}{5}$ rồi so sánh.");
  check("không đổ LaTeX thô ra danh sách", !/frac/.test(got), got);
  check("công thức thành ký hiệu ∑", got.includes("∑"), got);
  check("chữ quanh công thức còn nguyên", /Tính/.test(got) && /rồi so sánh/.test(got), got);
  check(
    "công thức khối $$…$$ cũng gọn",
    !/frac/.test(previewText("Cho $$\\frac{a}{b}$$ hãy rút gọn.")),
  );
}

/* ── Không phá văn bản thường ─────────────────────────────────────────── */
check("câu không có mốc nào giữ nguyên", previewText("Thủ đô của Việt Nam là gì?") === "Thủ đô của Việt Nam là gì?");
check("gộp khoảng trắng thừa", previewText("A    B") === "A B");
check("chuỗi rỗng → rỗng", previewText("") === "");
check("null/undefined không nổ", previewText(undefined) === "" && previewText(null) === "");
check(
  "ngoặc vuông thường KHÔNG bị đụng",
  previewText("Xem [Hình 2] và bảng [1]") === "Xem [Hình 2] và bảng [1]",
  previewText("Xem [Hình 2] và bảng [1]"),
);
check(
  "giá tiền có dấu $ đứng một mình không bị nuốt",
  previewText("Giá 5 $ một cái") === "Giá 5 $ một cái",
  previewText("Giá 5 $ một cái"),
);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
