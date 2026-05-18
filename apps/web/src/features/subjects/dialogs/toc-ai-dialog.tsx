"use client";

import {
  ChevronDown,
  ChevronRight,
  Check,
  ImagePlus,
  Loader2,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TOC_LEVELS } from "../data/seed-toc";
import { cn } from "@/lib/utils";

export interface TocAiNode {
  name: string;
  children?: TocAiNode[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName?: string;
  gradeName?: string;
  /** Called when user confirms — receives the AI-generated tree to apply. */
  onApply: (tree: TocAiNode[]) => void;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; tree: TocAiNode[] }
  | { kind: "error"; message: string };

export function TocAiDialog({
  open,
  onOpenChange,
  subjectName,
  gradeName,
  onApply,
}: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      setImage(null);
      setState({ kind: "idle" });
    }
  }, [open]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setState({ kind: "error", message: "File không phải ảnh hợp lệ." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setState({
        kind: "error",
        message: `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB) — tối đa 5MB.`,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setImage({ dataUrl, name: file.name });
      setState({ kind: "idle" });
    };
    reader.onerror = () =>
      setState({ kind: "error", message: "Không đọc được file." });
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!text.trim() && !image) {
      setState({
        kind: "error",
        message: "Hãy dán văn bản mô tả hoặc tải ảnh trang sách lên.",
      });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/generate-toc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          imageDataUrl: image?.dataUrl,
          subject: subjectName,
          grade: gradeName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      const tree = Array.isArray(data.tree) ? data.tree : [];
      if (tree.length === 0) {
        setState({
          kind: "error",
          message: "AI không trích xuất được mục lục từ nội dung cung cấp.",
        });
        return;
      }
      setState({ kind: "result", tree });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Không kết nối được tới server",
      });
    }
  }

  function apply() {
    if (state.kind !== "result") return;
    onApply(state.tree);
    onOpenChange(false);
  }

  const showResult = state.kind === "result";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl p-0 max-h-[92vh] overflow-y-auto"
        srTitle="AI tạo mục lục môn học"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Sparkles className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">AI tạo mục lục môn học</h2>
            <p className="text-meta mt-0.5">
              {subjectName || "—"} · {gradeName || "—"} · dán văn bản
              hoặc upload ảnh trang sách, AI sẽ tách thành cây 4 cấp Chương /
              Chủ đề / Chủ điểm / Kỹ năng
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {!showResult && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">
                  Văn bản mô tả chương trình (tuỳ chọn)
                </Label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder={`vd: Chương I — Đạo hàm và ứng dụng\n  1.1 Định nghĩa đạo hàm\n  1.2 Quy tắc tính\n    - Đạo hàm hàm hợp\n    - Đạo hàm hàm ngược\n  1.3 Ứng dụng vẽ đồ thị\n\nChương II — …`}
                  disabled={state.kind === "loading"}
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">
                  Hoặc tải ảnh trang sách / mục lục
                </Label>
                {image ? (
                  <div className="relative overflow-hidden rounded-lg border bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.dataUrl}
                      alt={image.name}
                      className="mx-auto block max-h-64 w-auto object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[12px] text-muted-foreground shadow hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" /> Xoá
                    </button>
                    <p className="border-t bg-surface px-3 py-1.5 text-[12px] text-muted-foreground">
                      {image.name}
                    </p>
                  </div>
                ) : (
                  <label
                    htmlFor="toc-ai-image"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleFile(e.dataTransfer.files?.[0]);
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-surface-2 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.85} />
                    <div>
                      <p className="text-[13px] font-medium text-foreground">
                        Chọn ảnh trang sách hoặc kéo thả vào đây
                      </p>
                      <p className="text-meta mt-0.5">
                        PNG / JPG / WEBP — tối đa 5MB
                      </p>
                    </div>
                  </label>
                )}
                <input
                  ref={fileInputRef}
                  id="toc-ai-image"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
            </>
          )}

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/75">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
              Đang phân tích nội dung… (~3-6 giây cho ảnh)
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
                <p className="font-semibold">Không tạo được mục lục</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
              </div>
            </div>
          )}

          {showResult && state.kind === "result" && (
            <div>
              <p className="text-eyebrow mb-2 flex items-center gap-2">
                <ImagePlus className="h-3 w-3" />
                Mục lục AI đề xuất · {countNodes(state.tree)} mục
              </p>
              <div className="max-h-[460px] overflow-y-auto rounded-lg border bg-surface px-3 py-2">
                <TreePreview nodes={state.tree} depth={0} />
              </div>
              <p className="text-meta mt-2 leading-relaxed">
                Bạn có thể đổi ý — bấm "Soạn lại" để xoá kết quả và thử input
                khác. Sau khi "Áp dụng", các mục sẽ được thêm vào{" "}
                <span className="font-semibold">cuối</span> danh sách mục lục hiện
                tại (không xoá mục cũ).
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>

          {showResult ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setState({ kind: "idle" })}
              >
                Soạn lại
              </Button>
              <Button onClick={apply}>
                <Check className="h-4 w-4" />
                Áp dụng vào mục lục
              </Button>
            </div>
          ) : (
            <Button onClick={generate} disabled={state.kind === "loading"}>
              {state.kind === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Phân tích & tạo mục lục
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function TreePreview({ nodes, depth }: { nodes: TocAiNode[]; depth: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <ul className="space-y-0.5">
      {nodes.map((n, idx) => (
        <TreeRow
          key={`${depth}-${idx}-${n.name}`}
          node={n}
          path={`${depth}-${idx}`}
          depth={depth}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  path,
  depth,
  collapsed,
  setCollapsed,
}: {
  node: TocAiNode;
  path: string;
  depth: number;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
}) {
  const level = TOC_LEVELS[Math.min(depth, TOC_LEVELS.length - 1)]!;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isOpen = !collapsed.has(path);

  function toggle() {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
  }

  return (
    <li>
      <div
        className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </button>
        ) : (
          <span className="inline-block w-[20px]" />
        )}
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
            level.chipBg,
            level.chipFg,
          )}
        >
          {level.short}
        </span>
        <span className="text-[13px] text-foreground/90">{node.name}</span>
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {node.children!.map((c, idx) => (
            <TreeRow
              key={`${path}-${idx}-${c.name}`}
              node={c}
              path={`${path}-${idx}`}
              depth={depth + 1}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function countNodes(nodes: TocAiNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    if (node.children) n += countNodes(node.children);
  }
  return n;
}
