"use client";

import { Image as ImageIcon, Link2, Music2, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MediaKind = "image" | "video" | "audio" | "link";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MediaKind;
  /** When editing an existing chip — pre-fill src + label. */
  initialSrc?: string;
  initialLabel?: string;
  onInsert: (snippet: string) => void;
}

const COPY: Record<
  MediaKind,
  { title: string; desc: string; placeholder: string; Icon: typeof ImageIcon; accent: string }
> = {
  image: {
    title: "Chèn ảnh",
    desc: "Tải ảnh từ máy hoặc dán URL trực tiếp.",
    placeholder: "https://… hoặc /uploads/abc.png",
    Icon: ImageIcon,
    accent: "bg-sky-50 text-sky-600 ring-sky-200",
  },
  video: {
    title: "Chèn video",
    desc: "URL nhúng YouTube / Vimeo hoặc file mp4.",
    placeholder: "https://www.youtube.com/embed/…",
    Icon: Video,
    accent: "bg-rose-50 text-rose-600 ring-rose-200",
  },
  audio: {
    title: "Chèn audio",
    desc: "URL file âm thanh (.mp3, .wav, .ogg).",
    placeholder: "https://… hoặc /audio/abc.mp3",
    Icon: Music2,
    accent: "bg-violet-50 text-violet-600 ring-violet-200",
  },
  link: {
    title: "Chèn liên kết",
    desc: "Đường dẫn web — sẽ chèn dưới dạng markdown.",
    placeholder: "https://…",
    Icon: Link2,
    accent: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  },
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export function MediaInsertDialog({
  open,
  onOpenChange,
  kind,
  initialSrc,
  initialLabel,
  onInsert,
}: Props) {
  const copy = COPY[kind];
  const Icon = copy.Icon;

  const isEditing = Boolean(initialSrc);
  const initialIsDataUrl = Boolean(initialSrc?.startsWith("data:"));

  const [tab, setTab] = useState<"upload" | "url">(
    kind === "image" && (!isEditing || initialIsDataUrl) ? "upload" : "url",
  );
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [filePreview, setFilePreview] = useState<{ dataUrl: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync editing state when dialog opens.
  useEffect(() => {
    if (!open) {
      setTab(kind === "image" ? "upload" : "url");
      setUrl("");
      setLabel("");
      setWidth("");
      setHeight("");
      setFilePreview(null);
      setError(null);
      return;
    }
    if (isEditing) {
      setLabel(initialLabel ?? "");
      if (initialIsDataUrl) {
        setTab("upload");
        setFilePreview({ dataUrl: initialSrc!, name: initialLabel || "ảnh hiện tại" });
        setUrl("");
      } else {
        setTab("url");
        setUrl(initialSrc ?? "");
        setFilePreview(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, initialSrc, initialLabel, kind]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("File không phải ảnh hợp lệ.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB) — tối đa ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setFilePreview({ dataUrl, name: file.name });
      if (!label) setLabel(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.onerror = () => setError("Không đọc được file.");
    reader.readAsDataURL(file);
  }

  function buildSnippet(): string {
    const l = (label.trim() || "media").replaceAll("]", "\\]");
    const source = tab === "upload" && filePreview ? filePreview.dataUrl : url.trim();
    if (!source) return "";

    switch (kind) {
      case "image": {
        const size =
          width || height ? ` =${width || ""}${height ? "x" + height : ""}` : "";
        return `\n\n![${l}](${source}${size})\n\n`;
      }
      case "video":
        return `\n\n[video:${source} | ${l}]\n\n`;
      case "audio":
        return `\n\n[audio:${source} | ${l}]\n\n`;
      case "link":
        return ` [${l}](${source}) `;
    }
  }

  function submit() {
    const snippet = buildSnippet();
    if (!snippet) return;
    onInsert(snippet);
    onOpenChange(false);
  }

  const canSubmit =
    tab === "upload" ? Boolean(filePreview?.dataUrl) : Boolean(url.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 max-h-[88vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${copy.accent}`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">{copy.title}</DialogTitle>
            <p className="text-meta mt-0.5">{copy.desc}</p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {kind === "image" && (
            <div className="inline-flex rounded-md border bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setTab("upload")}
                className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === "upload"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tải lên từ máy
              </button>
              <button
                type="button"
                onClick={() => setTab("url")}
                className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === "url"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Từ URL
              </button>
            </div>
          )}

          {kind === "image" && tab === "upload" ? (
            <div className="space-y-2">
              {filePreview ? (
                <div className="relative overflow-hidden rounded-lg border bg-surface-2">
                  <img
                    src={filePreview.dataUrl}
                    alt={filePreview.name}
                    className="block max-h-64 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFilePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute right-2 top-2 rounded-md bg-surface px-2 py-1 text-[12px] text-muted-foreground shadow hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5 inline" /> Xoá
                  </button>
                  <p className="border-t bg-surface px-3 py-1.5 text-[12px] text-muted-foreground">
                    {filePreview.name}
                  </p>
                </div>
              ) : (
                <label
                  htmlFor="media-file-input"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-surface-2 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <Upload className="h-7 w-7 text-muted-foreground" strokeWidth={1.85} />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Chọn file ảnh hoặc kéo thả vào đây
                    </p>
                    <p className="text-meta mt-0.5">
                      PNG · JPG · WEBP · GIF — tối đa 2MB
                    </p>
                  </div>
                </label>
              )}
              <input
                ref={fileInputRef}
                id="media-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {error && (
                <p className="text-[12px] text-destructive">{error}</p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">URL</Label>
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={copy.placeholder}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              {kind === "link" ? "Văn bản hiển thị" : "Mô tả / alt text"}
            </Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "link" ? "vd: xem thêm" : "vd: minh hoạ tam giác"}
            />
          </div>

          {kind === "image" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">
                  Rộng (px)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="vd: 320"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">
                  Cao (px)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="(tuỳ chọn)"
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Chèn
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
