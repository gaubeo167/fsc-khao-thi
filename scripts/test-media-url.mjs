#!/usr/bin/env node
/**
 * Test hồi quy cho bộ nhận dạng URL media
 * (apps/web/src/features/question-bank/components/media-utils.ts).
 *
 * Chạy:  node scripts/test-media-url.mjs
 *
 * Vì sao có file này: giáo viên dán ĐÚNG cái URL trên thanh địa chỉ, không
 * ai đi tìm "URL nhúng". Mà URL trên thanh địa chỉ của YouTube và Google
 * Drive đều KHÔNG nhúng thẳng được — `youtube.com/watch?v=…` bỏ vào iframe
 * là YouTube từ chối, Drive `/view` trả về trang xem chứ không phải video.
 *
 * Nhận dạng trượt thì học sinh vào làm bài thấy một thẻ bấm RA NGOÀI, mà màn
 * làm bài đang khoá toàn màn hình — bấm ra là hỏng bài. Nên đây không phải
 * tiện nghi, nó là điều kiện để câu hỏi có video dùng được.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-media-")), "m.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/components/media-utils.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { classifyMediaUrl, embedHint } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};
const emb = (u) => classifyMediaUrl(u).embedUrl;

/* ── YouTube: bốn lối viết, copy lối nào cũng phải chạy ───────────────── */
check(
  "watch?v= (URL trên thanh địa chỉ)",
  emb("https://www.youtube.com/watch?v=dQw4w9WgXcQ") ===
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  emb("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
);
check("youtu.be rút gọn", emb("https://youtu.be/dQw4w9WgXcQ") === "https://www.youtube.com/embed/dQw4w9WgXcQ");
check(
  "youtu.be kèm tham số chia sẻ ?si=",
  emb("https://youtu.be/dQw4w9WgXcQ?si=AbCdEf") === "https://www.youtube.com/embed/dQw4w9WgXcQ",
);
check("/shorts/", emb("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.includes("/embed/dQw4w9WgXcQ"));
check("/live/", emb("https://www.youtube.com/live/dQw4w9WgXcQ")?.includes("/embed/dQw4w9WgXcQ"));
check("/embed/ (đã là URL nhúng)", emb("https://www.youtube.com/embed/dQw4w9WgXcQ")?.includes("/embed/dQw4w9WgXcQ"));
check("m.youtube.com (link từ điện thoại)", classifyMediaUrl("https://m.youtube.com/watch?v=abc123").type === "youtube");

/* ── Mốc thời gian: copy lúc đang xem giữa video ──────────────────────── */
check(
  "t=90 → start=90",
  emb("https://www.youtube.com/watch?v=abc123&t=90") === "https://www.youtube.com/embed/abc123?start=90",
  emb("https://www.youtube.com/watch?v=abc123&t=90"),
);
check(
  "t=1m30s → start=90",
  emb("https://youtu.be/abc123?t=1m30s") === "https://www.youtube.com/embed/abc123?start=90",
  emb("https://youtu.be/abc123?t=1m30s"),
);
check(
  "t=1h2m3s → start=3723",
  emb("https://youtu.be/abc123?t=1h2m3s")?.endsWith("start=3723"),
  emb("https://youtu.be/abc123?t=1h2m3s"),
);
check(
  "t rác thì bỏ qua, không sinh start=NaN",
  emb("https://youtu.be/abc123?t=abc") === "https://www.youtube.com/embed/abc123",
  emb("https://youtu.be/abc123?t=abc"),
);

/* ── Google Drive: kiểu hay dùng nhất ở trường ────────────────────────── */
check(
  "link chia sẻ /file/d/ID/view",
  emb("https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing") ===
    "https://drive.google.com/file/d/1AbC_dEf-123/preview",
  emb("https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing"),
);
check(
  "kiểu cũ open?id=",
  emb("https://drive.google.com/open?id=1AbC_dEf-123") ===
    "https://drive.google.com/file/d/1AbC_dEf-123/preview",
);
check("docs.google.com/file/d/", classifyMediaUrl("https://docs.google.com/file/d/1AbC/edit").type === "drive");

/* ── Vimeo ────────────────────────────────────────────────────────────── */
check("vimeo.com/ID", emb("https://vimeo.com/123456789") === "https://player.vimeo.com/video/123456789");
check(
  "vimeo có đoạn phụ /123/abc",
  emb("https://vimeo.com/123456789/abcdef")?.includes("/video/123456789"),
);

/* ── File trực tiếp ───────────────────────────────────────────────────── */
check("mp4", classifyMediaUrl("https://x.com/a.mp4").type === "direct");
check("webm đúng mime", classifyMediaUrl("https://x.com/a.webm").mime === "video/webm");
check(
  "URL tải về của Firebase Storage (.mp4 kèm ?alt=media)",
  classifyMediaUrl(
    "https://firebasestorage.googleapis.com/v0/b/x/o/q%2Fbai.mp4?alt=media&token=abc",
  ).type === "direct",
);

/* ── Không nhận ra thì phải NÓI, không im lặng ────────────────────────── */
{
  const k = classifyMediaUrl("https://vi.wikipedia.org/wiki/Sinh_học");
  check("trang web thường → link", k.type === "link");
  check("có câu nhắc cho người soạn", (embedHint(k) ?? "").includes("Không nhận ra"), embedHint(k));
  check("câu nhắc nêu các dịch vụ hỗ trợ", (embedHint(k) ?? "").includes("Google Drive"));
  check("URL nhúng được thì KHÔNG nhắc", embedHint(classifyMediaUrl("https://youtu.be/abc")) === null);
}
check("chuỗi rỗng → link", classifyMediaUrl("").type === "link");
check("chuỗi không phải URL → link", classifyMediaUrl("bài giảng số 1").type === "link");

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
