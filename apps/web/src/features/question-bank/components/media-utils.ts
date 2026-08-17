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
