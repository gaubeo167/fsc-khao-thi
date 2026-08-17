"use client";

import React, { useMemo } from "react";

import { Math } from "./math";
import { parseAudioMarker, type AudioMarker } from "../lib/audio-marker";
import { mathAnyRe } from "@/lib/math-delimiters";
import { classifyMediaUrl } from "./media-utils";
import { cn } from "@/lib/utils";

interface Block {
  kind: "text" | "math";
  body: string;
  display: boolean;
  /** Character index in the source string where the block begins. */
  start: number;
  end: number;
}

/**
 * Splits source into text + math blocks using `$$...$$` and `$...$`
 * delimiters. Markdown bold/italic and images are passed through as plain
 * text (rendered visually below for now — full markdown is out of scope).
 */
function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const regex = mathAnyRe();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m.index > last) {
      blocks.push({
        kind: "text",
        body: source.slice(last, m.index),
        display: false,
        start: last,
        end: m.index,
      });
    }
    const matched = m[0];
    if (matched.startsWith("$$")) {
      blocks.push({
        kind: "math",
        body: matched.slice(2, -2).trim(),
        display: true,
        start: m.index,
        end: m.index + matched.length,
      });
    } else {
      blocks.push({
        kind: "math",
        body: matched.slice(1, -1),
        display: false,
        start: m.index,
        end: m.index + matched.length,
      });
    }
    last = m.index + matched.length;
  }
  if (last < source.length) {
    blocks.push({
      kind: "text",
      body: source.slice(last),
      display: false,
      start: last,
      end: source.length,
    });
  }
  return blocks;
}

interface Props {
  content: string;
  /**
   * If provided, math fragments become clickable. Callback receives the
   * source character range so the editor can swap the formula in place.
   */
  onClickFormula?: (range: { start: number; end: number; tex: string; display: boolean }) => void;
  className?: string;
  /**
   * Render the wrapper as a `<span>` instead of `<div>` so it sits inside a
   * chip or table cell without breaking the parent layout.
   */
  inline?: boolean;
  /**
   * If true, strip underline `[u:phrase]` markers so the rendered passage
   * looks plain. Used for student-facing previews (so the underline answers
   * aren't given away). Default false.
   */
  hideUnderlineMarks?: boolean;
  /**
   * Kiểm soát lượt nghe cho mốc `[audio:… | … | N]`.
   *
   * Không truyền thì audio chỉ hiện quy định ("Được nghe 2 lần") mà không
   * khoá — đúng cho màn xem trước / kho câu hỏi, nơi giáo viên cần nghe thử
   * bao nhiêu lần tuỳ ý. Màn LÀM BÀI của học sinh truyền vào để khoá thật.
   */
  audioLimit?: {
    /** Số lần ĐÃ nghe của bài audio thứ `index` trong câu này. */
    playsOf: (index: number) => number;
    /** Học sinh bấm nghe — trả `false` nếu đã hết lượt. */
    onPlay: (index: number, maxPlays: number) => boolean | Promise<boolean>;
  };
}

export function RenderedContent({
  content,
  onClickFormula,
  className,
  inline,
  hideUnderlineMarks,
  audioLimit,
}: Props) {
  const sanitized = hideUnderlineMarks
    ? content.replace(/\[u:([^\]\n]+)\]/g, "$1")
    : content;
  const blocks = useMemo(() => parse(sanitized), [sanitized]);
  const Wrapper = inline ? "span" : "div";
  // Đếm lại từ 0 mỗi lần render, theo đúng thứ tự đọc của nội dung — nên số
  // thứ tự của một bài audio không đổi giữa các lần render.
  let audioSeq = 0;
  const audioCtx: AudioCtx = { limit: audioLimit, next: () => audioSeq++ };

  return (
    <Wrapper
      className={cn(
        "text-[13px] leading-relaxed text-foreground/90",
        inline && "inline-flex flex-wrap items-baseline gap-x-0.5",
        className,
      )}
    >
      {blocks.map((b, i) => {
        if (b.kind === "text") {
          // Strip basic markdown bold/italic visually + preserve line breaks
          const parts = b.body.split(/(\n)/);
          return (
            <span key={i}>
              {parts.map((p, j) =>
                p === "\n" ? (
                  <br key={j} />
                ) : (
                  <span key={j}>{renderTextFragment(p, audioCtx)}</span>
                ),
              )}
            </span>
          );
        }
        return (
          <Math
            key={i}
            tex={b.body}
            displayMode={b.display}
            onClick={
              onClickFormula
                ? () =>
                    onClickFormula({
                      start: b.start,
                      end: b.end,
                      tex: b.body,
                      display: b.display,
                    })
                : undefined
            }
          />
        );
      })}
    </Wrapper>
  );
}

/**
 * Inline markdown: **bold** + *italic* + ![](src) → <img> + [video:…] +
 * [audio:…]. Embed media as real preview cards so cards/view/preview all
 * show the asset (not just placeholder text).
 */
interface AudioCtx {
  limit?: Props["audioLimit"];
  /** Số thứ tự bài audio kế tiếp trong TOÀN BỘ nội dung câu, không phải
   *  trong riêng đoạn đang render — hai bài trong một câu phải đếm riêng. */
  next: () => number;
}

function renderTextFragment(text: string, ctx?: AudioCtx): React.ReactNode {
  if (!text) return text;
  const mediaRegex = /(!\[[^\]]*\]\([^)]+\)|\[video:[^\]]+\]|\[audio:[^\]]+\]|\[blank:\d+\]|\[zone:\d+\]|\[u:[^\]\n]+\])/g;
  if (!mediaRegex.test(text)) return emphasize(text);

  mediaRegex.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = mediaRegex.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        <React.Fragment key={`t-${key++}`}>
          {emphasize(text.slice(last, m.index))}
        </React.Fragment>,
      );
    }
    parts.push(
      renderMediaSnippet(
        m[0],
        m.index,
        ctx?.limit,
        m[0].startsWith("[audio:") ? (ctx?.next() ?? 0) : 0,
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(
      <React.Fragment key={`t-${key++}`}>
        {emphasize(text.slice(last))}
      </React.Fragment>,
    );
  }
  return <>{parts}</>;
}

function renderMediaSnippet(
  snippet: string,
  key: number,
  audioLimit?: Props["audioLimit"],
  audioIndex = 0,
): React.ReactNode {
  const imgMatch = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)(?:x\d+)?)?\)$/.exec(snippet);
  if (imgMatch) {
    const alt = imgMatch[1];
    const src = imgMatch[2].trim();
    const width = imgMatch[3] ? Number(imgMatch[3]) : null;
    return (
      <span
        key={`img-${key}`}
        className="my-2 inline-block overflow-hidden rounded-lg border bg-[var(--color-surface-2)] align-top max-w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={width ? { width: `${width}px` } : undefined}
          className="block max-h-[400px] w-full max-w-full object-contain"
        />
      </span>
    );
  }

  const videoMatch = /^\[video:([^|\]]+?)\s*\|\s*([^\]]*)\]$/.exec(snippet);
  if (videoMatch) {
    const src = videoMatch[1].trim();
    const label = videoMatch[2].trim() || "Video";
    const kind = classifyMediaUrl(src);

    if (kind.type === "youtube" || kind.type === "vimeo" || kind.type === "drive") {
      return (
        <span key={`vid-${key}`} className="my-2 block overflow-hidden rounded-lg border bg-black">
          <span className="block aspect-video w-full">
            <iframe
              src={kind.embedUrl}
              title={label}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="block h-full w-full border-0"
            />
          </span>
          {label && label !== "Video" ? (
            <span className="block border-t bg-surface px-3 py-1 text-[12px] text-muted-foreground">
              {label}
            </span>
          ) : null}
        </span>
      );
    }

    if (kind.type === "direct") {
      return (
        <span key={`vid-${key}`} className="my-2 block overflow-hidden rounded-lg border bg-black">
          <video
            src={src}
            controls
            className="block max-h-[400px] w-full object-contain"
          >
            <source src={src} type={kind.mime} />
          </video>
          {label && label !== "Video" ? (
            <span className="block border-t bg-surface px-3 py-1 text-[12px] text-muted-foreground">
              {label}
            </span>
          ) : null}
        </span>
      );
    }

    // Không nhúng được: vẫn cho bấm ra ngoài, nhưng nói rõ đây là đường dẫn
    // ngoài — ở màn thi thì bấm là rời khỏi bài.
    return (
      <a
        key={`vid-${key}`}
        href={src}
        target="_blank"
        rel="noreferrer"
        className="my-2 flex items-center gap-3 rounded-lg border bg-rose-50/50 px-3 py-2.5 text-[13px] no-underline ring-1 ring-rose-200 transition-colors hover:bg-rose-50"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-600">
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-rose-900">{label}</span>
          <span className="block truncate text-[11px] text-rose-700/80">{src}</span>
        </span>
      </a>
    );
  }

  const audio = parseAudioMarker(snippet);
  if (audio) {
    return (
      <AudioBlock
        key={`aud-${key}`}
        marker={audio}
        index={audioIndex}
        limit={audioLimit}
      />
    );
  }

  const blankMatch = /^\[blank:(\d+)\]$/.exec(snippet);
  if (blankMatch) {
    const n = blankMatch[1];
    return (
      <span
        key={`blank-${key}`}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-primary/70 bg-primary/5 px-2 py-0.5 align-middle text-[13px] font-semibold text-primary"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
          {n}
        </span>
        <span className="text-muted-foreground">______</span>
      </span>
    );
  }

  const underlineMatch = /^\[u:([^\]\n]+)\]$/.exec(snippet);
  if (underlineMatch) {
    return (
      <span
        key={`u-${key}`}
        className="font-medium text-foreground underline decoration-2 decoration-emerald-600 underline-offset-2"
      >
        {underlineMatch[1]}
      </span>
    );
  }

  const zoneMatch = /^\[zone:(\d+)\]$/.exec(snippet);
  if (zoneMatch) {
    const n = zoneMatch[1];
    return (
      <span
        key={`zone-${key}`}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-amber-500/70 bg-amber-50 px-2 py-0.5 align-middle text-[13px] font-semibold text-amber-800"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
          {n}
        </span>
        <span className="text-amber-700">vùng thả</span>
      </span>
    );
  }

  return <span key={`unk-${key}`}>{snippet}</span>;
}

function emphasize(s: string): React.ReactNode {
  // First pull out `<span style="…">…</span>` runs so we render them as real
  // styled spans (color / font-size / font-family). They may contain
  // markdown markers internally — recurse into emphasize() for the inner.
  const spanRegex = /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/i;
  const spanMatch = spanRegex.exec(s);
  if (spanMatch) {
    const [whole, style, inner] = spanMatch;
    const before = s.slice(0, spanMatch.index);
    const after = s.slice(spanMatch.index + whole.length);
    const styleObj = parseInlineStyle(style);
    return (
      <>
        {emphasize(before)}
        <span style={styleObj}>{emphasize(inner)}</span>
        {emphasize(after)}
      </>
    );
  }

  const out: React.ReactNode[] = [];
  let rest = s;
  let key = 0;
  // Strings get wrapped in a keyed span here so the final array — passed into
  // <>{out}</> — has a key on every child (React requires keys on array members
  // even when they are plain strings).
  const pushText = (s: string) => {
    if (s) out.push(<React.Fragment key={key++}>{s}</React.Fragment>);
  };
  while (rest.length > 0) {
    // Check most-specific patterns first so ***bold-italic*** wins over **bold**
    const boldItalic = /\*\*\*([\s\S]+?)\*\*\*/.exec(rest);
    const bold = /\*\*([\s\S]+?)\*\*/.exec(rest);
    const italic = /(^|[^*])\*([^*\n]+?)\*(?!\*)/.exec(rest);
    const underline = /__([\s\S]+?)__/.exec(rest);
    const strike = /~~([\s\S]+?)~~/.exec(rest);
    const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(rest);
    const candidates = [boldItalic, bold, italic, underline, strike, link].filter(
      Boolean,
    ) as RegExpExecArray[];
    if (candidates.length === 0) {
      pushText(rest);
      break;
    }
    candidates.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      // At the same index, prefer the more-specific match (longer marker)
      const aLen = (a[0] ?? "").length;
      const bLen = (b[0] ?? "").length;
      return bLen - aLen;
    });
    const first = candidates[0]!;
    if (first.index > 0) {
      pushText(rest.slice(0, first.index));
    }
    // Recurse so nested markdown (e.g. __**bold inside underline**__) renders.
    if (first === boldItalic) {
      out.push(
        <strong key={key++}>
          <em>{emphasize(boldItalic![1])}</em>
        </strong>,
      );
    } else if (first === bold) {
      out.push(<strong key={key++}>{emphasize(bold![1])}</strong>);
    } else if (first === italic) {
      const leading = italic![1] ?? "";
      const body = italic![2] ?? "";
      pushText(leading);
      out.push(<em key={key++}>{emphasize(body)}</em>);
    } else if (first === underline) {
      out.push(<u key={key++}>{emphasize(underline![1])}</u>);
    } else if (first === strike) {
      out.push(<s key={key++}>{emphasize(strike![1])}</s>);
    } else if (first === link) {
      out.push(
        <a key={key++} href={link![2]} className="text-primary underline" target="_blank" rel="noreferrer">
          {emphasize(link![1])}
        </a>,
      );
    }
    rest = rest.slice(first.index + first[0].length);
  }
  return <>{out}</>;
}

/** Parse a CSS `style` attribute into a React style object — whitelist
 *  typographic props so we don't apply arbitrary CSS from user content. */
function parseInlineStyle(raw: string): React.CSSProperties {
  const allowed = new Set([
    "color",
    "backgroundColor",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "fontStyle",
    "textDecoration",
    "textDecorationLine",
  ]);
  const cssToReact = (prop: string): string =>
    prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  const out: Record<string, string> = {};
  for (const decl of raw.split(";")) {
    const [propRaw, ...rest] = decl.split(":");
    const prop = propRaw?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!prop || !value) continue;
    if (/url\s*\(|expression/i.test(value)) continue;
    const reactProp = cssToReact(prop);
    if (allowed.has(reactProp)) out[reactProp] = value;
  }
  return out;
}

/**
 * Bài nghe, có thể giới hạn số lần bấm nghe.
 *
 * Vì sao KHÔNG dùng `<audio controls>` trần khi có giới hạn: thanh điều khiển
 * mặc định cho tua đi tua lại và bấm play bao nhiêu lần tuỳ ý, không có chỗ
 * nào chặn được. Có giới hạn thì thay bằng một nút "Nghe" do mình kiểm soát:
 * bấm là tiêu một lượt, nghe xong tự dừng, hết lượt thì nút khoá.
 *
 * `limit` không truyền (kho câu hỏi, xem trước) thì chỉ HIỆN quy định chứ
 * không khoá — giáo viên phải nghe thử được bao nhiêu lần tuỳ ý.
 */
function AudioBlock({
  marker,
  index,
  limit,
}: {
  marker: AudioMarker;
  index: number;
  limit?: Props["audioLimit"];
}) {
  const ref = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const enforced = marker.maxPlays != null && limit != null;
  const used = enforced ? limit!.playsOf(index) : 0;
  // KHÔNG dùng `Math.max` ở file này: `Math` đã bị component công thức cùng
  // tên che mất (xem import ở đầu file).
  const left =
    marker.maxPlays != null ? (marker.maxPlays - used > 0 ? marker.maxPlays - used : 0) : null;

  async function start() {
    if (!ref.current || playing) return;
    if (enforced) {
      const ok = await limit!.onPlay(index, marker.maxPlays!);
      if (!ok) return;
    }
    ref.current.currentTime = 0;
    setPlaying(true);
    void ref.current.play();
  }

  return (
    <span className="my-2 flex items-center gap-3 rounded-lg border bg-violet-50/50 px-3 py-2.5 text-[13px] ring-1 ring-violet-200">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
        ♪
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-violet-900">{marker.label}</span>
        {enforced ? (
          <>
            <audio
              ref={ref}
              src={marker.src}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
            <span className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void start()}
                disabled={playing || left === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-small font-semibold text-white transition hover:bg-violet-700 disabled:bg-violet-200 disabled:text-violet-500"
              >
                {playing ? "Đang phát…" : left === 0 ? "Hết lượt nghe" : "Nghe"}
              </button>
              <span className="text-meta text-violet-800">
                Còn {left}/{marker.maxPlays} lượt
              </span>
            </span>
          </>
        ) : (
          <>
            <audio ref={ref} src={marker.src} controls className="mt-1 w-full" />
            {marker.maxPlays != null && (
              <span className="text-meta mt-0.5 block text-violet-800">
                Khi thi: chỉ được nghe {marker.maxPlays} lần.
              </span>
            )}
          </>
        )}
      </span>
    </span>
  );
}
