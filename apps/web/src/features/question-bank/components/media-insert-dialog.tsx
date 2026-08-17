"use client";

import { Image as ImageIcon, Link2, Music2, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MAX_QUESTION_AUDIO_BYTES,
  questionAudioPath,
  uploadFile,
} from "@/lib/storage";

import { buildAudioMarker } from "../lib/audio-marker";
import { classifyMediaUrl, embedHint } from "./media-utils";

export type MediaKind = "image" | "video" | "audio" | "link";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MediaKind;
  /** When editing an existing chip — pre-fill src + label. */
  initialSrc?: string;
  initialLabel?: string;
  /** Giới hạn lượt nghe của thẻ audio đang sửa (chuỗi từ thuộc tính DOM). */
  initialMaxPlays?: string | null;
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
    desc: "Tải file âm thanh từ máy hoặc dán URL (.mp3, .wav, .ogg).",
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
  initialMaxPlays,
  onInsert,
}: Props) {
  const copy = COPY[kind];
  const Icon = copy.Icon;

  const isEditing = Boolean(initialSrc);
  const initialIsDataUrl = Boolean(initialSrc?.startsWith("data:"));

  const [tab, setTab] = useState<"upload" | "url">(
    (kind === "image" || kind === "audio") && (!isEditing || initialIsDataUrl)
      ? "upload"
      : "url",
  );
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  /** Số lần học sinh được bấm nghe. Rỗng = không giới hạn. */
  const [maxPlays, setMaxPlays] = useState("");
  /** Đang tải audio lên Storage (0–1), `null` khi không tải. */
  const [uploading, setUploading] = useState<number | null>(null);
  /** URL audio đã tải lên xong — dùng thay cho `filePreview` (ảnh base64). */
  const [uploadedAudio, setUploadedAudio] = useState<{ url: string; name: string } | null>(
    null,
  );
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
      setTab(kind === "image" || kind === "audio" ? "upload" : "url");
      setUrl("");
      setLabel("");
      setWidth("");
      setHeight("");
      setFilePreview(null);
      setUploadedAudio(null);
      setUploading(null);
      setError(null);
      return;
    }
    if (isEditing) {
      setLabel(initialLabel ?? "");
      setMaxPlays(initialMaxPlays ?? "");
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
    if (kind === "audio") {
      void handleAudioFile(file);
      return;
    }
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

  /**
   * Tải audio lên Firebase Storage rồi dùng URL tải về.
   *
   * KHÔNG nhét base64 vào nội dung như ảnh: một tài liệu Firestore chỉ chứa
   * được 1MB, mà bài nghe 5 phút đã 5MB — nhét vào thì câu hỏi không lưu
   * được, và lỗi chỉ nổ lúc bấm Lưu, sau khi người soạn đã gõ xong cả câu.
   */
  async function handleAudioFile(file: File) {
    if (!file.type.startsWith("audio/")) {
      setError("File không phải âm thanh (.mp3, .wav, .ogg, .m4a).");
      return;
    }
    if (file.size > MAX_QUESTION_AUDIO_BYTES) {
      setError(
        `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB) — tối đa ` +
          `${MAX_QUESTION_AUDIO_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }
    const uid = useAuthStore.getState().session?.userId;
    if (!uid) {
      setError("Cần đăng nhập lại trước khi tải file lên.");
      return;
    }
    setError(null);
    setUploading(0);
    try {
      const res = await uploadFile(
        questionAudioPath(uid, file.name),
        file,
        (p) => setUploading(p.fraction),
      );
      setUploadedAudio({ url: res.downloadUrl, name: file.name });
      // KHÔNG tự điền nhãn bằng tên file. Nhãn là thứ HỌC SINH đọc thấy, mà
      // tên file thường là "bai-nghe-de-2-dap-an.mp3" — vừa lộ thông tin vừa
      // xấu. Để trống thì trình phát hiện "Bài nghe".
    } catch (err) {
      // Nói rõ chế độ offline: ở local không có khoá Firebase thì upload
      // không thể chạy, mà thông báo "lỗi không xác định" thì không ai đoán ra.
      setError(
        isFirebaseConfigured()
          ? err instanceof Error
            ? err.message
            : "Tải lên thất bại (không rõ nguyên nhân)."
          : "Chế độ chạy thử không có kho file — dán URL audio thay vì tải lên.",
      );
    } finally {
      setUploading(null);
    }
  }

  function buildSnippet(): string {
    const l = (label.trim() || "media").replaceAll("]", "\\]");
    const source =
      tab === "upload"
        ? kind === "audio"
          ? (uploadedAudio?.url ?? "")
          : (filePreview?.dataUrl ?? "")
        : url.trim();
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
        return `\n\n${buildAudioMarker(source, l, maxPlays.trim() ? Number(maxPlays) : null)}\n\n`;
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
    tab === "upload"
      ? kind === "audio"
        ? Boolean(uploadedAudio?.url)
        : Boolean(filePreview?.dataUrl)
      : Boolean(url.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent srDescription="Chèn ảnh, video, âm thanh hoặc liên kết vào nội dung câu hỏi." className="max-w-md p-0 max-h-[88vh] overflow-y-auto">
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
          {(kind === "image" || kind === "audio") && (
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

          {kind === "audio" && tab === "upload" ? (
            <div className="space-y-2">
              {uploadedAudio ? (
                <div className="rounded-lg border bg-surface-2 px-3 py-2.5">
                  <p className="text-small font-medium text-foreground">
                    {uploadedAudio.name}
                  </p>
                  <audio src={uploadedAudio.url} controls className="mt-1.5 w-full" />
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedAudio(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-meta mt-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="mr-1 inline h-3.5 w-3.5" />
                    Chọn file khác
                  </button>
                </div>
              ) : uploading != null ? (
                <div className="rounded-lg border bg-surface-2 px-4 py-6 text-center">
                  <p className="text-small font-medium">Đang tải lên…</p>
                  <div className="mx-auto mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-violet-500 transition-all"
                      style={{ width: `${Math.round(uploading * 100)}%` }}
                    />
                  </div>
                  <p className="text-meta mt-1">{Math.round(uploading * 100)}%</p>
                  {uploading === 0 && (
                    <p className="text-meta mt-2 text-muted-foreground">
                      Đứng ở 0% quá lâu thường là dự án chưa bật kho file
                      (Firebase Console → Storage → Get Started), hoặc chưa chạy{" "}
                      <code className="rounded bg-muted px-1">
                        firebase deploy --only storage
                      </code>
                      . Trong lúc chờ, chuyển sang tab “Từ URL” để chèn tạm.
                    </p>
                  )}
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
                    <p className="text-small font-medium text-foreground">
                      Chọn file âm thanh hoặc kéo thả vào đây
                    </p>
                    <p className="text-meta mt-0.5">
                      MP3 · WAV · OGG · M4A — tối đa{" "}
                      {MAX_QUESTION_AUDIO_BYTES / 1024 / 1024}MB
                    </p>
                  </div>
                </label>
              )}
              <input
                ref={fileInputRef}
                id="media-file-input"
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {error && <p className="text-meta text-destructive">{error}</p>}
            </div>
          ) : kind === "image" && tab === "upload" ? (
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
              {/* Xem thử NGAY tại đây.
                  Không có bước này thì người soạn chỉ biết URL hỏng vào lúc
                  học sinh đang thi — mà lúc đó không sửa được nữa. */}
              {kind === "video" && url.trim() && (
                <VideoUrlPreview url={url.trim()} />
              )}
              {kind === "audio" && url.trim() && (
                <audio src={url.trim()} controls className="mt-1 w-full" />
              )}
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

          {/* Số lần nghe: chỉ có nghĩa với audio. Đề nghe thường cho nghe 1–2
              lần; để trống là không giới hạn, đúng như trước khi có ô này nên
              câu cũ không đổi hành vi. */}
          {kind === "audio" && (
            <div className="space-y-1.5">
              <Label className="text-small font-medium text-foreground/80">
                Số lần được nghe
              </Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxPlays}
                onChange={(e) => setMaxPlays(e.target.value)}
                placeholder="Để trống = nghe thoải mái"
              />
              <p className="text-meta text-muted-foreground">
                Khi thi, học sinh chỉ bấm nghe được đúng số lần này — bộ đếm do
                máy chủ giữ nên tải lại trang không được thêm lượt. Ở kho câu
                hỏi và màn xem trước thì vẫn nghe thử thoải mái.
              </p>
            </div>
          )}

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

/**
 * Xem thử video ngay trong hộp chèn.
 *
 * Nhận ra dịch vụ thì nhúng luôn để người soạn thấy đúng cái học sinh sẽ
 * thấy. Không nhận ra thì nói thẳng là học sinh sẽ chỉ có một thẻ bấm ra
 * ngoài — ở màn thi đang khoá toàn màn hình, bấm ra ngoài là hỏng bài.
 */
function VideoUrlPreview({ url }: { url: string }) {
  const kind = classifyMediaUrl(url);
  const hint = embedHint(kind);

  if (hint) {
    return (
      <p className="text-meta mt-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900">
        {hint}
      </p>
    );
  }
  return (
    <div className="mt-1 overflow-hidden rounded-lg border bg-black">
      {kind.type === "direct" ? (
        <video src={url} controls className="block max-h-52 w-full object-contain" />
      ) : (
        <div className="aspect-video w-full">
          <iframe
            src={kind.type === "link" ? url : kind.embedUrl}
            title="Xem thử"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="block h-full w-full border-0"
          />
        </div>
      )}
    </div>
  );
}
