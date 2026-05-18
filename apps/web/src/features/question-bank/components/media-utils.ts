/**
 * Classify a media URL so the renderer can pick the right embed strategy.
 *
 * - `youtube` / `vimeo` → iframe with the provider's embed URL
 * - `direct`           → `<video>` element (works for .mp4, .webm, .ogg)
 * - `link`             → fall back to a clickable link card
 */
export type EmbedKind =
  | { type: "youtube"; embedUrl: string }
  | { type: "vimeo"; embedUrl: string }
  | { type: "direct"; mime: string }
  | { type: "link" };

const DIRECT_VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i;

export function classifyMediaUrl(url: string): EmbedKind {
  const trimmed = url.trim();
  if (!trimmed) return { type: "link" };

  // Direct video files
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

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
      if (m) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${m[1]}` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id && /^\d+$/.test(id))
        return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
  } catch {
    // not a parseable URL — fall through
  }

  return { type: "link" };
}
