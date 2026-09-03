/**
 * Nhận dạng URL media để chọn cách nhúng.
 *
 * - `youtube` / `vimeo` / `drive` → iframe theo đúng URL nhúng của nhà cung cấp
 * - `direct`                      → thẻ `<video>` (mp4, webm, ogg…)
 * - `link`                        → không nhúng được, chỉ hiện thẻ bấm ra ngoài
 *
 * ── Vì sao phải nhận dạng nhiều kiểu ────────────────────────────────────
 *
 * Giáo viên dán ĐÚNG cái URL trên thanh địa chỉ, không ai đi tìm "URL nhúng".
 * Mà URL trên thanh địa chỉ của YouTube, Google Drive… đều KHÔNG nhúng thẳng
 * được: `youtube.com/watch?v=…` bỏ vào iframe là YouTube từ chối, Drive thì
 * trả về trang xem chứ không phải video.
 *
 * Không đổi thì học sinh vào làm bài thấy một cái thẻ bấm ra ngoài — rời khỏi
 * màn thi, mà màn thi đang khoá toàn màn hình. Nên "nhận dạng được" ở đây
 * không phải tiện nghi, nó là điều kiện để câu hỏi dùng được.
 */
export type EmbedKind =
  | { type: "youtube"; embedUrl: string }
  | { type: "vimeo"; embedUrl: string }
  | { type: "drive"; embedUrl: string }
  | { type: "direct"; mime: string }
  | { type: "link" };

const DIRECT_VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i;

/** Giây bắt đầu từ `t=90`, `t=1m30s`, `start=90`. `null` nếu không có. */
function startSeconds(u: URL): number | null {
  const raw = u.searchParams.get("start") ?? u.searchParams.get("t");
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const yt = (id: string, start: number | null): EmbedKind => ({
  type: "youtube",
  embedUrl: `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ""}`,
});

export function classifyMediaUrl(url: string): EmbedKind {
  const trimmed = url.trim();
  if (!trimmed) return { type: "link" };

  // File video trực tiếp
  if (DIRECT_VIDEO_EXT.test(trimmed) || trimmed.startsWith("data:video/")) {
    const m = DIRECT_VIDEO_EXT.exec(trimmed);
    const ext = m ? m[1].toLowerCase() : "mp4";
    const mime =
      ext === "webm"
        ? "video/webm"
        : ext === "ogg" || ext === "ogv"
          ? "video/ogg"
          : "video/mp4";
    return { type: "direct", mime };
  }

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    const start = startSeconds(u);

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = u.searchParams.get("v");
      if (id) return yt(id, start);
      // /embed/ID · /shorts/ID · /live/ID · /v/ID — YouTube có bốn lối viết,
      // giáo viên copy lối nào cũng phải chạy.
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/);
      if (m) return yt(m[1]!, start);
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return yt(id, start);
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
      if (id) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
    // Google Drive — kiểu hay dùng nhất ở trường: giáo viên tải video lên
    // Drive rồi copy đường dẫn chia sẻ. Bản xem `/view` không nhúng được,
    // phải đổi sang `/preview`.
    if (host === "drive.google.com" || host === "docs.google.com") {
      const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
      const id = m ? m[1]! : u.searchParams.get("id");
      if (id) {
        return { type: "drive", embedUrl: `https://drive.google.com/file/d/${id}/preview` };
      }
    }
  } catch {
    // không phải URL đọc được — rơi xuống dưới
  }

  return { type: "link" };
}

/** Câu nhắc cho người soạn khi URL không nhúng được. */
export function embedHint(kind: EmbedKind): string | null {
  if (kind.type !== "link") return null;
  return (
    "Không nhận ra dịch vụ video từ URL này — học sinh sẽ thấy một thẻ bấm " +
    "ra ngoài thay vì trình phát, mà màn làm bài đang khoá toàn màn hình. " +
    "Hỗ trợ: YouTube, Vimeo, Google Drive (link chia sẻ), hoặc file .mp4/.webm trực tiếp."
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * ÂM THANH
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * URL âm thanh → nguồn phát được, hoặc lý do không phát được.
 *
 * ── Vì sao không dùng chung `classifyMediaUrl` ──────────────────────────
 *
 * Video hỏng thì rơi về iframe của nhà cung cấp và vẫn xem được. Âm thanh
 * KHÔNG có lối đó: câu nghe hiểu giới hạn số lượt nghe, mà bộ đếm lượt chỉ
 * chạy trên thẻ `<audio>` của mình — nhét iframe vào là mất luôn giới hạn,
 * học sinh nghe bao nhiêu lần cũng được.
 *
 * Nên ở đây chỉ có hai kết cục: ra được đường dẫn PHÁT THẲNG, hoặc nói thẳng
 * là không dùng được và bảo người soạn tải file lên.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Trước đây phần âm thanh cắm thẳng `<audio src={url}>`. Giáo viên dán link
 * chia sẻ Google Drive — cái ai cũng dán — thì `<audio>` nhận về một trang
 * HTML, không phải tiếng: máy phát đứng ở 0:00 / 0:00, bấm không chạy, và
 * không có một dòng báo nào. Lộ ra lúc học sinh đang thi.
 */
export type AudioSource =
  | { kind: "playable"; src: string }
  | { kind: "unsupported"; reason: string };

/**
 * Link Drive → đường dẫn cầu nối trên máy chủ mình.
 *
 * Không trỏ thẳng vào Google nữa. `drive.google.com/uc?export=download` giờ
 * chuyển hướng 303 sang `drive.usercontent.google.com`, và thứ về tới nơi
 * rất hay là một TRANG HTML (đăng nhập Workspace, hỏi xác nhận quét virus).
 * `<audio>` nhận HTML thì đứng ở 0:00 và không báo gì — giáo viên đã mở chia
 * sẻ rồi vẫn không nghe được, mà không biết vì sao.
 *
 * Máy chủ đi lấy hộ, kiểm đúng là âm thanh rồi mới chuyển tiếp; hỏng thì trả
 * lỗi có chữ. Xem `app/api/media/audio/route.ts`.
 */
export function driveAudioProxy(fileId: string): string {
  return `/api/media/audio?drive=${encodeURIComponent(fileId)}`;
}

const DIRECT_AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)(\?.*)?$/i;

export function classifyAudioUrl(url: string): AudioSource {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return { kind: "unsupported", reason: "Chưa có đường dẫn." };

  // File tự tải lên (blob/data) — phát thẳng.
  if (trimmed.startsWith("data:audio/") || trimmed.startsWith("blob:")) {
    return { kind: "playable", src: trimmed };
  }

  // CHÚ Ý THỨ TỰ: xét TÊN MIỀN trước, đuôi file sau.
  //
  // Link chia sẻ Dropbox là `.../bai1.mp3?dl=0` — đuôi `.mp3` nằm ngay đó
  // nhưng nội dung trả về vẫn là TRANG HTML. Kiểm đuôi trước thì link này lọt
  // qua nguyên xi và máy phát lại đứng ở 0:00 y như cũ.
  let u: URL;
  try {
    u = new URL(trimmed, "https://x.invalid");
  } catch {
    return {
      kind: "unsupported",
      reason: "Đường dẫn không hợp lệ.",
    };
  }
  // Đường dẫn tương đối (/uploads/…) — do mình phục vụ, cứ phát.
  if (u.hostname === "x.invalid") {
    return DIRECT_AUDIO_EXT.test(u.pathname)
      ? { kind: "playable", src: trimmed }
      : {
          kind: "unsupported",
          reason:
            "Đường dẫn này không trỏ thẳng tới một file âm thanh. Tải file lên (nút bên cạnh) hoặc dán link kết thúc bằng .mp3 / .m4a / .wav.",
        };
  }

  const host = u.hostname.replace(/^www\./, "");

  // Google Drive: link chia sẻ là TRANG xem. Đi vòng qua cầu nối của mình —
  // trỏ thẳng vào lối tải của Google không còn ăn (xem `driveAudioProxy`).
  if (host === "drive.google.com" || host === "docs.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
    const id = m ? m[1]! : u.searchParams.get("id");
    if (id) {
      return { kind: "playable", src: driveAudioProxy(id) };
    }
    return {
      kind: "unsupported",
      reason:
        "Link Drive này không có mã file. Dùng link dạng .../file/d/<mã>/view, hoặc tải thẳng file lên.",
    };
  }

  // Dropbox: `?dl=0` mở trang xem; `raw=1` trả thẳng file.
  if (host === "dropbox.com" || host === "dl.dropboxusercontent.com") {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { kind: "playable", src: u.toString() };
  }

  // Đuôi file thật — xét trên ĐƯỜNG DẪN, không tính chuỗi truy vấn.
  if (DIRECT_AUDIO_EXT.test(u.pathname)) {
    return { kind: "playable", src: trimmed };
  }

  if (host.endsWith("youtube.com") || host === "youtu.be") {
    return {
      kind: "unsupported",
      reason:
        "YouTube không phát được trong ô nghe (và không đếm được số lượt nghe). Tải file âm thanh lên thay vì dán link.",
    };
  }

  return {
    kind: "unsupported",
    reason:
      "Đường dẫn này không trỏ thẳng tới một file âm thanh. Tải file lên (nút bên cạnh) hoặc dán link kết thúc bằng .mp3 / .m4a / .wav.",
  };
}
