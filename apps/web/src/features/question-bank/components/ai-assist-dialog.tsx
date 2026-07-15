"use client";

import {
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { authHeaders } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { RenderedContent } from "./rendered-content";

export type AiIntent = "question-content" | "answer" | "explanation";

export interface AiContext {
  questionType?: string;
  subject?: string;
  grade?: string;
  difficulty?: string;
  topic?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: AiIntent;
  context?: AiContext;
  /**
   * Called when user clicks "Chèn". For text mode this is the generated
   * string. For image mode this is a markdown `![alt](data:image/png;…)`
   * snippet that the wysiwyg editor inserts verbatim.
   */
  onAccept?: (text: string) => void;
}

const COPY: Record<AiIntent, { title: string; placeholderHint: string; cta: string }> = {
  "question-content": {
    title: "AI hỗ trợ tạo câu hỏi",
    placeholderHint:
      "Để trống để AI tự sinh theo môn / khối / chủ điểm đã chọn — hoặc nhập yêu cầu cụ thể.",
    cta: "Sinh nội dung",
  },
  answer: {
    title: "AI gợi ý phương án trả lời",
    placeholderHint:
      "vd: 4 phương án nhiễu hợp lý cho câu hỏi đang soạn, có công thức LaTeX.",
    cta: "Gợi ý đáp án",
  },
  explanation: {
    title: "AI viết phần giải thích",
    placeholderHint: "vd: Giải thích từng bước, ngắn gọn 3-4 câu.",
    cta: "Viết giải thích",
  },
};

type Mode = "text" | "image";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "text-result"; text: string }
  | { kind: "image-result"; dataUrl: string; revisedPrompt: string | null }
  | { kind: "error"; message: string };

export function AiAssistDialog({
  open,
  onOpenChange,
  intent,
  context,
  onAccept,
}: Props) {
  const copy = COPY[intent];
  const supportsImage = intent === "question-content";
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setState({ kind: "idle" });
      setMode("text");
    }
  }, [open]);

  const missing = useMemo(() => {
    if (intent !== "question-content") return [] as string[];
    const m: string[] = [];
    if (!context?.subject) m.push("Môn học");
    if (!context?.grade) m.push("Khối");
    return m;
  }, [intent, context]);

  const contextChips = useMemo(() => {
    const chips: Array<{ label: string; value: string }> = [];
    if (context?.subject) chips.push({ label: "Môn", value: context.subject });
    if (context?.grade) chips.push({ label: "Khối", value: context.grade });
    if (context?.difficulty) chips.push({ label: "Độ khó", value: context.difficulty });
    if (context?.topic) chips.push({ label: "Chủ điểm", value: context.topic });
    if (context?.questionType) chips.push({ label: "Dạng", value: context.questionType });
    return chips;
  }, [context]);

  async function generate() {
    if (missing.length > 0) {
      setState({
        kind: "error",
        message: `Vui lòng chọn ${missing.join(" + ")} ở phần trên trước khi để AI sinh nội dung.`,
      });
      return;
    }

    setState({ kind: "loading" });
    try {
      if (mode === "image") {
        const imagePrompt = prompt.trim() || buildAutoImagePrompt(context);
        const res = await fetch("/api/ai/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            prompt: imagePrompt,
            context: {
              subject: context?.subject,
              grade: context?.grade,
              topic: context?.topic,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
          return;
        }
        setState({
          kind: "image-result",
          dataUrl: data.dataUrl,
          revisedPrompt: data.revisedPrompt ?? null,
        });
      } else {
        const finalPrompt = prompt.trim() || buildAutoPrompt(intent, context);
        const res = await fetch("/api/ai/generate-question", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            intent,
            prompt: finalPrompt,
            context: {
              questionType: context?.questionType,
              subject: context?.subject,
              grade: context?.grade,
              difficulty: context?.difficulty,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
          return;
        }
        setState({ kind: "text-result", text: data.text });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối được tới server",
      });
    }
  }

  function accept() {
    if (state.kind === "text-result") {
      onAccept?.(state.text);
    } else if (state.kind === "image-result") {
      const alt = (prompt.trim() || context?.topic || "AI minh hoạ").replaceAll("]", "");
      onAccept?.(`\n\n![${alt}](${state.dataUrl})\n\n`);
    } else {
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 max-h-[88vh] overflow-y-auto"
        srTitle={copy.title}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Sparkles className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">{copy.title}</h2>
            <p className="text-meta mt-0.5">
              {mode === "image"
                ? "OpenAI DALL-E 3 · ~6-10 giây · cần OPENAI_API_KEY"
                : "Claude Haiku 4.5 · ~1-2 giây · cần ANTHROPIC_API_KEY"}
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {supportsImage && (
            <div className="inline-flex rounded-md border bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("text");
                  setState({ kind: "idle" });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
                  mode === "text"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Type className="h-3.5 w-3.5" strokeWidth={1.85} />
                Nội dung câu hỏi
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("image");
                  setState({ kind: "idle" });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
                  mode === "image"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.85} />
                Ảnh minh hoạ
              </button>
            </div>
          )}

          {(contextChips.length > 0 || missing.length > 0) && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5",
                missing.length > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-border bg-surface-2",
              )}
            >
              <p
                className={cn(
                  "text-eyebrow mb-1.5",
                  missing.length > 0 ? "text-amber-800" : "",
                )}
              >
                {missing.length > 0
                  ? "Thiếu thông tin để AI hoạt động"
                  : "AI sẽ sinh dựa trên"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {contextChips.map((c) => (
                  <span
                    key={`${c.label}-${c.value}`}
                    className="inline-flex items-center gap-1 rounded-md border bg-surface px-2 py-0.5 text-[12px] font-medium text-foreground/85"
                  >
                    <span className="text-muted-foreground">{c.label}:</span>
                    {c.value}
                  </span>
                ))}
                {missing.map((m) => (
                  <span
                    key={`missing-${m}`}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-800"
                  >
                    Cần chọn: {m}
                  </span>
                ))}
              </div>
              {missing.length > 0 && (
                <p className="text-meta mt-1.5 text-amber-700">
                  Hãy chọn ở phần trên rồi mở lại AI — AI cần biết môn và khối để
                  sinh nội dung phù hợp.
                </p>
              )}
            </div>
          )}

          {/* Prompt textarea — used by both modes */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              {mode === "image" ? "Mô tả ảnh muốn sinh" : "Yêu cầu thêm (tuỳ chọn)"}
            </Label>
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  generate();
                }
              }}
              rows={3}
              placeholder={
                mode === "image"
                  ? "vd: Sơ đồ tam giác vuông có cạnh huyền 5cm, hai cạnh góc vuông 3cm và 4cm. Phong cách SGK."
                  : copy.placeholderHint
              }
              disabled={state.kind === "loading"}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
            />
            <p className="text-meta">
              <kbd className="rounded border bg-muted px-1">⌘</kbd>
              <kbd className="ml-1 rounded border bg-muted px-1">↵</kbd> để gửi nhanh
            </p>
          </div>

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/75">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
              {mode === "image"
                ? "Đang sinh ảnh (DALL-E 3) · ~6-10 giây…"
                : "Đang sinh nội dung…"}
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={1.85}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-semibold">Không sinh được nội dung</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
              </div>
            </div>
          )}

          {state.kind === "text-result" && (
            <div>
              <p className="text-eyebrow mb-2">Kết quả AI</p>
              <div className="rounded-lg border bg-surface px-4 py-3">
                <RenderedContent content={state.text} />
              </div>
            </div>
          )}

          {state.kind === "image-result" && (
            <div>
              <p className="text-eyebrow mb-2">Ảnh đã sinh</p>
              <div className="overflow-hidden rounded-lg border bg-surface">
                <img
                  src={state.dataUrl}
                  alt="AI generated"
                  className="block max-h-[420px] w-full object-contain"
                />
              </div>
              {state.revisedPrompt && (
                <p className="text-meta mt-2 leading-relaxed">
                  <span className="font-semibold">DALL-E đã viết lại prompt: </span>
                  {state.revisedPrompt}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>

          {state.kind === "text-result" || state.kind === "image-result" ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setState({ kind: "idle" })}>
                <RefreshCw className="h-4 w-4" />
                Sinh lại
              </Button>
              <Button onClick={accept}>
                <Check className="h-4 w-4" />
                {state.kind === "image-result"
                  ? "Chèn ảnh vào câu hỏi"
                  : "Chèn vào câu hỏi"}
              </Button>
            </div>
          ) : (
            <Button onClick={generate} disabled={state.kind === "loading"}>
              {state.kind === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "image" ? (
                <ImagePlus className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {mode === "image" ? "Sinh ảnh" : copy.cta}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function buildAutoPrompt(intent: AiIntent, context: AiContext | undefined): string {
  if (intent === "answer") {
    return "Sinh các phương án trả lời cho câu hỏi đang soạn — 4 phương án, 1 đúng, 3 nhiễu hợp lý.";
  }
  if (intent === "explanation") {
    return "Viết phần giải thích đáp án ngắn gọn cho câu hỏi đang soạn.";
  }

  const parts: string[] = [];
  if (context?.questionType) parts.push(`dạng ${context.questionType}`);
  if (context?.subject) parts.push(`môn ${context.subject}`);
  if (context?.grade) parts.push(context.grade);
  if (context?.difficulty) parts.push(`độ khó ${context.difficulty}`);
  if (context?.topic) parts.push(`chủ điểm "${context.topic}"`);

  if (parts.length === 0) {
    return "Sinh 1 câu hỏi phù hợp với học sinh phổ thông Việt Nam, có công thức LaTeX khi cần.";
  }
  return `Sinh 1 câu hỏi ${parts.join(" · ")}. Súc tích, đúng chuẩn SGK Việt Nam, có công thức LaTeX khi cần.`;
}

function buildAutoImagePrompt(context: AiContext | undefined): string {
  const parts: string[] = [];
  if (context?.subject) parts.push(context.subject);
  if (context?.grade) parts.push(context.grade);
  if (context?.topic) parts.push(context.topic);
  if (parts.length === 0) return "Một ảnh minh hoạ giáo dục phong cách SGK.";
  return `Ảnh minh hoạ phong cách SGK cho ${parts.join(" · ")}, nét sạch, nền trắng.`;
}
