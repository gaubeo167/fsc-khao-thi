#!/usr/bin/env node
/**
 * Test hồi quy cho cầu nối phát file nghe trên Google Drive
 * (apps/web/src/lib/media/drive-audio.ts).
 *
 * Chạy:  node scripts/test-drive-audio.mjs
 *
 * ── Vì sao có file này ──────────────────────────────────────────────────
 *
 * Lỗi gốc: giáo viên dán link chia sẻ Drive, ĐÃ mở chia sẻ, mà học sinh vẫn
 * không nghe được. Nguyên nhân là `drive.google.com/uc?export=download` giờ
 * chuyển hướng 303 và thứ về tới nơi hay là một TRANG HTML — trang đăng nhập
 * Workspace, hoặc trang hỏi xác nhận quét virus. `<audio>` nhận HTML thì
 * đứng ở 0:00 và KHÔNG kêu lên tiếng nào.
 *
 * Nên chỗ phải khoá cứng là: nhận dạng "đây là HTML chứ không phải tiếng".
 * Nới chỗ đó ra một chút là quay lại đúng cái máy phát câm cũ, và nó chỉ lộ
 * ra giữa giờ thi.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-drive-audio-")), "d.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/lib/media/drive-audio.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const {
  canhBaoDungLuong,
  headerAmThanh,
  laKieuAmThanh,
  laMaFileDrive,
  LOI_KHONG_TAI_THANG_DUOC,
  LOI_TRA_VE_TRANG_WEB,
  loiTuDrive,
  NGUONG_NANG_BYTES,
  macXacNhanDrive,
  urlTaiDrive,
} = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── 1. Mã file: chỉ nhận mã Drive, không nhận URL ───────────────────── */
// Nhận URL tuỳ ý là mở cổng cho người ngoài bắt máy chủ mình gọi đi bất kỳ
// đâu — kể cả vào mạng nội bộ.
{
  check("mã Drive thường", laMaFileDrive("1AbC_dEf-XyZ0123456") === true);
  check("mã quá ngắn → chặn", laMaFileDrive("abc") === false);
  check("URL đầy đủ → chặn", laMaFileDrive("https://drive.google.com/x") === false);
  check("có dấu / → chặn", laMaFileDrive("1AbC/../../etc/passwd") === false);
  check("có dấu ? → chặn", laMaFileDrive("1AbCdEfGhIj?x=1") === false);
  check("có dấu chấm → chặn", laMaFileDrive("1AbCdEfGhIj.mp3") === false);
  check("rỗng → chặn", laMaFileDrive("") === false);
  check("null → chặn", laMaFileDrive(null) === false);
  check("mã 200 ký tự vẫn nhận", laMaFileDrive("a".repeat(200)) === true);
  check("dài quá 200 → chặn", laMaFileDrive("a".repeat(201)) === false);
}

/* ── 2. HTML KHÔNG phải âm thanh — đây là cái lỗi gốc ────────────────── */
{
  check("text/html → chặn", laKieuAmThanh("text/html; charset=utf-8") === false);
  check("text/html không có charset → chặn", laKieuAmThanh("text/html") === false);
  check("HOA/thường không quan trọng", laKieuAmThanh("TEXT/HTML") === false);
  check("text/plain → chặn", laKieuAmThanh("text/plain") === false);
  check(
    "application/xhtml+xml → chặn",
    laKieuAmThanh("application/xhtml+xml") === false,
  );

  check("audio/mpeg → nhận", laKieuAmThanh("audio/mpeg") === true);
  check("audio/mp4 → nhận", laKieuAmThanh("audio/mp4") === true);
  check(
    "application/octet-stream → nhận (Drive hay gắn nhãn này cho file tải lên)",
    laKieuAmThanh("application/octet-stream") === true,
  );
  check("application/binary → nhận", laKieuAmThanh("application/binary") === true);
  check(
    "video/webm → nhận (.weba đôi khi bị gắn nhãn video)",
    laKieuAmThanh("video/webm") === true,
  );
  check(
    "thiếu hẳn Content-Type → cho qua, để trình duyệt tự dò",
    laKieuAmThanh(null) === true && laKieuAmThanh(undefined) === true,
  );
}

/* ── 3. URL tải thẳng ────────────────────────────────────────────────── */
{
  const u = urlTaiDrive("1AbC_dEf");
  check("dùng drive.usercontent.google.com", u.startsWith("https://drive.usercontent.google.com/download"), u);
  check("mang theo id", u.includes("id=1AbC_dEf"), u);
  check("mang theo export=download", u.includes("export=download"), u);
  check("không kèm confirm khi không cần", !u.includes("confirm"), u);
  check("kèm confirm khi có", urlTaiDrive("x1234567890", "t").includes("confirm=t"));
  check("confirm null → bỏ qua", !urlTaiDrive("x1234567890", null).includes("confirm"));
}

/* ── 4. Móc mã xác nhận khỏi trang quét virus ────────────────────────── */
// Không móc được thì file nghe dài không bao giờ tải nổi.
{
  const form =
    '<form id="download-form" action="https://drive.usercontent.google.com/download">' +
    '<input type="hidden" name="id" value="1AbC"><input type="hidden" name="confirm" value="t">' +
    "</form>";
  check("móc được từ form", macXacNhanDrive(form) === "t", String(macXacNhanDrive(form)));
  check(
    "móc được từ đường dẫn có ?confirm=",
    macXacNhanDrive('<a href="/uc?export=download&confirm=AbC-1&id=x">tải</a>') === "AbC-1",
    String(macXacNhanDrive('<a href="/uc?export=download&confirm=AbC-1&id=x">')),
  );
  check("không có mã → null", macXacNhanDrive("<html><body>Lỗi</body></html>") === null);
  check("chuỗi rỗng → null", macXacNhanDrive("") === null);
}

/* ── 5. Mã lỗi → câu nói được việc ───────────────────────────────────── */
// Người đọc là giáo viên đang soạn đề và đang vội, không phải lập trình viên.
{
  check("200 không phải lỗi", loiTuDrive(200) === null);
  check("206 (tải một khúc) không phải lỗi", loiTuDrive(206) === null);
  check("403 nói về quyền chia sẻ", /chia sẻ/.test(loiTuDrive(403) ?? ""), String(loiTuDrive(403)));
  check("401 cũng nói về quyền chia sẻ", /chia sẻ/.test(loiTuDrive(401) ?? ""));
  check("403 chỉ ĐÚNG cái nút phải bấm", /Bất kỳ ai có đường liên kết/.test(loiTuDrive(403) ?? ""));
  check("404 nói không tìm thấy", /Không tìm thấy/.test(loiTuDrive(404) ?? ""));
  check("500 vẫn có câu nói", typeof loiTuDrive(500) === "string");
  check(
    "mọi câu lỗi đều mách nước tải file lên hoặc mở chia sẻ",
    [loiTuDrive(403), loiTuDrive(404), loiTuDrive(500), LOI_TRA_VE_TRANG_WEB, LOI_KHONG_TAI_THANG_DUOC]
      .every((c) => /tải\s+(thẳng\s+)?file|chia sẻ|đường dẫn/i.test(c)),
  );
  check("câu 'trả về trang web' nói tới nội bộ trường", /nội bộ/.test(LOI_TRA_VE_TRANG_WEB));
}

/* ── 6. Header trả về cho `<audio>` ──────────────────────────────────── */
{
  const drive = new Headers({
    "content-type": "application/octet-stream",
    "content-length": "5242880",
    "content-disposition": 'attachment; filename="bai-nghe-1.mp3"',
    "accept-ranges": "bytes",
    etag: '"abc"',
    "set-cookie": "NID=534=xyz",
  });
  const h = headerAmThanh(drive, "public, max-age=60");
  check(
    "octet-stream đổi thành audio/mpeg (Safari không chịu phát octet-stream)",
    h.get("content-type") === "audio/mpeg",
    String(h.get("content-type")),
  );
  check(
    "content-type là audio/* thì GIỮ nguyên",
    headerAmThanh(new Headers({ "content-type": "audio/mp4" }), "x").get("content-type") ===
      "audio/mp4",
  );
  check(
    "bỏ Content-Disposition: attachment, nếu không trình duyệt tải xuống thay vì phát",
    h.get("content-disposition") === "inline",
    String(h.get("content-disposition")),
  );
  check("giữ độ dài file", h.get("content-length") === "5242880");
  check("giữ etag", h.get("etag") === '"abc"');
  check("giữ accept-ranges để còn tua được", h.get("accept-ranges") === "bytes");
  check(
    "Drive không nói gì về ranges thì vẫn khai bytes",
    headerAmThanh(new Headers(), "x").get("accept-ranges") === "bytes",
  );
  check("truyền tiếp content-range khi tải một khúc", headerAmThanh(new Headers({ "content-range": "bytes 0-99/500" }), "x").get("content-range") === "bytes 0-99/500");
  check("đặt đúng cache-control được truyền vào", h.get("cache-control") === "public, max-age=60");
  check("có nosniff", h.get("x-content-type-options") === "nosniff");
  check("KHÔNG chuyển tiếp cookie của Google", h.get("set-cookie") === null);
}

/* ── 7. Cảnh báo file nghe quá nặng ──────────────────────────────────── */
//
// Ca thi thật đang dùng một file 46MB (33 phút, stereo 192 kbps). Nhân với
// một ca 1700 học sinh là ~77GB tải về — trên wifi trường thì không phải
// "chậm" mà là không mở nổi, và chỉ vỡ ra đúng lúc cả phòng bấm play.
//
// Nói lúc SOẠN thì giáo viên còn xuất lại file được. Nói lúc thi thì vô ích.
{
  const MB = 1024 * 1024;
  check("ngưỡng bằng đúng giới hạn tải file lên (20MB)", NGUONG_NANG_BYTES === 20 * MB, String(NGUONG_NANG_BYTES));
  check("file 5MB → không nói gì", canhBaoDungLuong(5 * MB) === null);
  check("đúng bằng ngưỡng → chưa cảnh báo", canhBaoDungLuong(20 * MB) === null);
  check("nhỉnh hơn ngưỡng → cảnh báo", canhBaoDungLuong(20 * MB + 1) !== null);

  const that = canhBaoDungLuong(48513446); // file thật của ca ĐGNL Tiếng Anh
  check("file 46MB có cảnh báo", that !== null);
  check("nói ra ĐÚNG số MB", /46 MB/.test(that ?? ""), String(that));
  check("mách nước nén mono 64 kbps", /mono 64 kbps/.test(that ?? ""), String(that));
  check("mách nước tải thẳng file lên", /tải thẳng file lên/.test(that ?? ""));

  check("không biết dung lượng → không doạ suông", canhBaoDungLuong(null) === null);
  check("dung lượng không phải số → không doạ suông", canhBaoDungLuong(NaN) === null);
  check("số âm → không doạ suông", canhBaoDungLuong(-1) === null);
}

/* ── 8. Route phải dùng đúng luật này, không chép lại ────────────────── */
// Hai bản luật là hai bản trôi khỏi nhau — mà lệch ở đây thì máy phát câm.
{
  const route = readFileSync(
    "apps/web/src/app/api/media/audio/route.ts",
    "utf8",
  );
  check("route nhập luật từ lib", /from "@\/lib\/media\/drive-audio"/.test(route));
  check("route chỉ nhận tham số `drive`", /searchParams\.get\("drive"\)/.test(route));
  check(
    "route KHÔNG nhận URL tuỳ ý (chặn SSRF)",
    !/searchParams\.get\("(src|url)"\)/.test(route),
  );
  check("route kiểm mã file trước khi gọi đi", /laMaFileDrive\(/.test(route));
  check("route chuyển tiếp header Range để còn tua được", /headers\.get\("range"\)/.test(route));
  check("route trả 206 khi Google trả 206", /status === 206 \? 206 : 200/.test(route));
  check("route có HEAD (trình duyệt hỏi độ dài trước khi phát)", /export async function HEAD/.test(route));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
