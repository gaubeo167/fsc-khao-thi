#!/usr/bin/env node
/**
 * Test hồi quy cho mốc audio kèm giới hạn số lần nghe
 * (apps/web/src/features/question-bank/lib/audio-marker.ts).
 *
 * Chạy:  node scripts/test-audio-marker.mjs
 *
 * Vì sao có file này: mốc audio đã tồn tại từ trước dưới dạng
 * `[audio:nguồn | nhãn]`, và đề đang chạy trong kho đều viết kiểu đó. Thêm
 * phần "số lần nghe" vào cùng cái mốc thì luật đọc phải giữ NGUYÊN cách hiểu
 * mốc cũ — sai ở đây là mọi câu nghe đã lưu bị hỏng, không phải chỉ câu mới.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-audio-")), "a.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/audio-marker.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { parseAudioMarker, buildAudioMarker, audioPlayKey, looksLikeFileName } =
  await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Mốc CŨ phải đọc y như trước ──────────────────────────────────────── */
{
  const m = parseAudioMarker("[audio:https://x.mp3 | Bài nghe số 1]");
  check("mốc cũ: đọc được nguồn", m?.src === "https://x.mp3", JSON.stringify(m));
  check("mốc cũ: đọc được nhãn", m?.label === "Bài nghe số 1", JSON.stringify(m));
  check("mốc cũ: KHÔNG giới hạn số lần", m?.maxPlays === null, JSON.stringify(m));
}
// Nhãn mặc định là "Bài nghe", KHÔNG phải tên file: nhãn là thứ học sinh đọc
// thấy, mà tên file thường kiểu "bai-nghe-de-2-dap-an.mp3".
check(
  "mốc cũ không có nhãn → nhãn mặc định",
  parseAudioMarker("[audio:https://x.mp3]")?.label === "Bài nghe",
  JSON.stringify(parseAudioMarker("[audio:https://x.mp3]")),
);
check(
  "mốc cũ nhãn rỗng → nhãn mặc định",
  parseAudioMarker("[audio:https://x.mp3 | ]")?.label === "Bài nghe",
);

/* ── Nhãn là TÊN FILE thì không hiện ra cho học sinh ──────────────────── */
//
// Câu soạn trước bản này có nhãn tự điền bằng tên file, và nhãn đó đã nằm
// trong nội dung ĐÃ LƯU — sửa chỗ tự điền không cứu được chúng. Nên bắt ở
// lúc đọc.
check("nhãn .mp3 → thay bằng Bài nghe", parseAudioMarker("[audio:x.mp3 | bainghe1.mp3]")?.label === "Bài nghe");
check("nhãn .m4a", parseAudioMarker("[audio:x.mp3 | Track01.m4a]")?.label === "Bài nghe");
check(
  "nhãn kiểu tên file không đuôi (gạch nối, không dấu cách)",
  parseAudioMarker("[audio:x.mp3 | bai-nghe-de-2-dap-an]")?.label === "Bài nghe",
);
check(
  "nhãn NGƯỜI VIẾT (có dấu cách) thì giữ nguyên",
  parseAudioMarker("[audio:x.mp3 | Bài nghe số 1 - phần A]")?.label === "Bài nghe số 1 - phần A",
);
check("nhãn ngắn có gạch nối vẫn giữ", parseAudioMarker("[audio:x.mp3 | Phần-A]")?.label === "Phần-A");
check("một chữ thường vẫn giữ", parseAudioMarker("[audio:x.mp3 | Listening]")?.label === "Listening");
check("looksLikeFileName: rỗng → false", looksLikeFileName("") === false);

/* ── Mốc MỚI có số lần ────────────────────────────────────────────────── */
{
  const m = parseAudioMarker("[audio:https://x.mp3 | Bài nghe số 1 | 2]");
  check("mốc mới: đọc được số lần", m?.maxPlays === 2, JSON.stringify(m));
  check("mốc mới: nhãn không nuốt mất số lần", m?.label === "Bài nghe số 1", JSON.stringify(m));
  check("mốc mới: nguồn vẫn đúng", m?.src === "https://x.mp3");
}
check("số lần 1", parseAudioMarker("[audio:a.mp3 | x | 1]")?.maxPlays === 1);
check("số lần nhiều chữ số", parseAudioMarker("[audio:a.mp3 | x | 10]")?.maxPlays === 10);
check(
  "số lần 0 = vô nghĩa → hiểu là không giới hạn",
  parseAudioMarker("[audio:a.mp3 | x | 0]")?.maxPlays === null,
);
check(
  "khoảng trắng thừa quanh số lần",
  parseAudioMarker("[audio:a.mp3 | x |  3  ]")?.maxPlays === 3,
);

/* ── Không nhận nhầm ──────────────────────────────────────────────────── */
check("mốc video không phải mốc audio", parseAudioMarker("[video:a.mp4 | x]") === null);
check("chuỗi thường không phải mốc", parseAudioMarker("nghe bài 1") === null);
check("mốc ô trống không phải mốc audio", parseAudioMarker("[blank:1]") === null);
check(
  "nhãn có chữ số KHÔNG bị hiểu thành số lần",
  parseAudioMarker("[audio:a.mp3 | Bài 2]")?.maxPlays === null,
  JSON.stringify(parseAudioMarker("[audio:a.mp3 | Bài 2]")),
);
check(
  "nhãn có chữ số vẫn giữ nguyên nhãn",
  parseAudioMarker("[audio:a.mp3 | Bài 2]")?.label === "Bài 2",
);

/* ── Dựng mốc ─────────────────────────────────────────────────────────── */
check(
  "dựng mốc không giới hạn",
  buildAudioMarker("a.mp3", "Bài 1") === "[audio:a.mp3 | Bài 1]",
  buildAudioMarker("a.mp3", "Bài 1"),
);
check(
  "dựng mốc có giới hạn",
  buildAudioMarker("a.mp3", "Bài 1", 2) === "[audio:a.mp3 | Bài 1 | 2]",
  buildAudioMarker("a.mp3", "Bài 1", 2),
);
check("dựng rồi đọc lại ra đúng số lần", parseAudioMarker(buildAudioMarker("a.mp3", "B", 3))?.maxPlays === 3);
check(
  "nhãn có dấu | bị đổi để không phá cấu trúc mốc",
  !buildAudioMarker("a.mp3", "Bài 1 | phần 2", 2).includes("Bài 1 | phần"),
  buildAudioMarker("a.mp3", "Bài 1 | phần 2", 2),
);
check(
  "nhãn có dấu | vẫn giữ được số lần",
  parseAudioMarker(buildAudioMarker("a.mp3", "Bài 1 | phần 2", 2))?.maxPlays === 2,
  buildAudioMarker("a.mp3", "Bài 1 | phần 2", 2),
);
check("số lần lẻ được làm tròn xuống", buildAudioMarker("a.mp3", "B", 2.9).includes("| 2]"));

/* ── Khoá đếm ─────────────────────────────────────────────────────────── */
check("khoá đếm theo câu + thứ tự", audioPlayKey("q1", 0) === "q1#0");
check("hai bài trong cùng câu có khoá khác nhau", audioPlayKey("q1", 0) !== audioPlayKey("q1", 1));
check("cùng thứ tự ở câu khác nhau cũng khác khoá", audioPlayKey("q1", 0) !== audioPlayKey("q2", 0));

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
