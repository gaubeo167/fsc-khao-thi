"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authHeaders } from "@/lib/api-client";
import type { FrameworkNode } from "@/lib/toc/parse-framework";
import { cn } from "@/lib/utils";

import { TOC_LEVELS } from "../data/seed-toc";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName?: string;
  gradeName?: string;
  /** Codes already present for this subject+grade (to show mới / trùng). */
  existingCodes: Set<string>;
  /** Confirm — receives the parsed framework tree (nodes carry `code`). */
  onApply: (tree: FrameworkNode[]) => void;
}

interface Counts {
  chapters: number;
  topics: number;
  indicators: number;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; fileName: string }
  | {
      kind: "result";
      tree: FrameworkNode[];
      counts: Counts;
      /** Dòng có mã mà bộ đọc không hiểu — phải hiện, không được bỏ im. */
      skipped: string[];
      fileName: string;
    }
  | { kind: "error"; message: string };

function allCodes(tree: FrameworkNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: FrameworkNode[]) => {
    for (const n of nodes) {
      out.push(n.code);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

export function FrameworkImportDialog({
  open,
  onOpenChange,
  subjectName,
  gradeName,
  existingCodes,
  onApply,
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setState({ kind: "idle" });
  }, [open]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setState({ kind: "error", message: "Chỉ hỗ trợ file Word .docx." });
      return;
    }
    setState({ kind: "loading", fileName: file.name });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/subjects/parse-framework", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      setState({
        kind: "result",
        tree: data.tree as FrameworkNode[],
        counts: data.counts as Counts,
        skipped: (data.skipped as string[] | undefined) ?? [],
        fileName: file.name,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối được tới server",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function apply() {
    if (state.kind !== "result") return;
    onApply(state.tree);
    onOpenChange(false);
  }

  const result = state.kind === "result" ? state : null;
  const codes = result ? allCodes(result.tree) : [];
  const newCount = codes.filter((c) => !existingCodes.has(c)).length;
  const dupCount = codes.length - newCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent srDescription="Nhập khung năng lực từ file Word, xem trước cây chương rồi xác nhận."
        className="max-w-3xl p-0 max-h-[92vh] overflow-y-auto"
        srTitle="Tải khung kiến thức từ file"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-200">
            <FileText className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">Tải khung kiến thức (.docx)</h2>
            <p className="text-meta mt-0.5">
              {subjectName || "—"} · {gradeName || "—"} · tải file mẫu chuẩn có
              mã (vd [SI10.01.1.D01]) → tự tách Chương / Chuyên đề / Chỉ báo
              kèm mã. Không dùng AI, chính xác 100% theo mã.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {!result && state.kind !== "loading" && (
            <div className="rounded-lg border bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed">
              <p className="mb-1 font-semibold text-foreground/85">Quy ước file mẫu</p>
              <ul className="space-y-0.5 text-foreground/75">
                <li>
                  • Chương: <code className="rounded bg-muted px-1">[SI10.01]: 1. Tên chương</code>.
                </li>
                <li>
                  • Chuyên đề: <code className="rounded bg-muted px-1">1.1. Tên chuyên đề</code>.
                </li>
                <li>
                  • Chỉ báo: dòng mã <code className="rounded bg-muted px-1">[SI10.01.1.D01]</code> rồi
                  dòng nội dung ngay dưới.
                </li>
                <li>• SI10 = Môn + Khối (đổi theo môn của bạn). Mỗi node có mã riêng.</li>
              </ul>
              <a
                href="/api/subjects/framework-template"
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary underline"
              >
                <Upload className="h-3.5 w-3.5 rotate-180" />
                Tải file mẫu (.docx)
              </a>
            </div>
          )}
          {!result && (
            <label
              htmlFor="framework-file"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-surface-2 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Upload className="h-6 w-6 text-muted-foreground" strokeWidth={1.85} />
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  Chọn file .docx hoặc kéo thả vào đây
                </p>
                <p className="text-meta mt-0.5">
                  File Word theo mẫu khung kiến thức cần đạt — tối đa 8MB
                </p>
              </div>
            </label>
          )}
          <input
            ref={fileInputRef}
            id="framework-file"
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/75">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
              Đang đọc “{state.fileName}”…
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Không đọc được khung kiến thức</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
              </div>
            </div>
          )}

          {result && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/75">
                  {result.counts.chapters} chương
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/75">
                  {result.counts.topics} chuyên đề
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/75">
                  {result.counts.indicators} chỉ báo
                </span>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  {newCount} mã mới sẽ thêm
                </span>
                {dupCount > 0 && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    {dupCount} mã đã có (bỏ qua)
                  </span>
                )}
                {result.skipped.length > 0 && (
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                    {result.skipped.length} dòng không đọc được mã
                  </span>
                )}
              </div>
              {/* Chỉ báo rơi ở bước này KHÔNG dừng ở "khung thiếu": đề trích
                  dẫn đúng mã đó sẽ tụt xuống đường khớp theo số chỉ báo và gắn
                  câu vào lá KHÁC, mà màn nhập đề vẫn báo "đã khớp". */}
              {result.skipped.length > 0 && (
                <div className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 px-4 py-3">
                  <p className="inline-flex items-center gap-1.5 text-small font-semibold text-rose-900">
                    <TriangleAlert className="h-4 w-4" strokeWidth={2} />
                    {result.skipped.length} dòng có mã nhưng đọc không ra — những
                    chỉ báo này sẽ KHÔNG vào khung
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {result.skipped.slice(0, 8).map((line) => (
                      <li key={line} className="text-meta font-mono text-rose-800">
                        {line.length > 90 ? `${line.slice(0, 90)}…` : line}
                      </li>
                    ))}
                  </ul>
                  {result.skipped.length > 8 && (
                    <p className="text-meta mt-1 text-rose-800">
                      …và {result.skipped.length - 8} dòng nữa.
                    </p>
                  )}
                  <p className="text-meta mt-1.5 text-rose-800">
                    Mã chỉ báo cần dạng <b>[SI10.02.15.E01]</b> — mã môn, chương,
                    chủ điểm, rồi chữ + số chỉ báo.
                  </p>
                </div>
              )}
              <div className="max-h-[440px] overflow-y-auto rounded-lg border bg-surface px-3 py-2">
                <TreePreview nodes={result.tree} depth={0} existingCodes={existingCodes} />
              </div>
              <p className="text-meta mt-2 leading-relaxed">
                Chỉ các <span className="font-semibold text-emerald-700">mã mới</span> được thêm
                vào mục lục. Mã đã tồn tại giữ nguyên (không đụng câu hỏi đã gắn).
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          {result ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setState({ kind: "idle" })}>
                Chọn file khác
              </Button>
              <Button onClick={apply} disabled={newCount === 0}>
                <Check className="h-4 w-4" />
                Thêm {newCount} mã mới
              </Button>
            </div>
          ) : (
            <span className="text-meta">Chọn file để xem trước</span>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function TreePreview({
  nodes,
  depth,
  existingCodes,
}: {
  nodes: FrameworkNode[];
  depth: number;
  existingCodes: Set<string>;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <ul className="space-y-0.5">
      {nodes.map((n, idx) => (
        <TreeRow
          key={n.code}
          node={n}
          path={`${depth}-${idx}`}
          depth={depth}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          existingCodes={existingCodes}
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
  existingCodes,
}: {
  node: FrameworkNode;
  path: string;
  depth: number;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  existingCodes: Set<string>;
}) {
  const level = TOC_LEVELS[Math.min(depth, TOC_LEVELS.length - 1)]!;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isOpen = !collapsed.has(path);
  const isDup = existingCodes.has(node.code);

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
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
          {node.code}
        </span>
        <span className="truncate text-[13px] text-foreground/90">{node.name}</span>
        {isDup && (
          <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            đã có
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {node.children!.map((c, idx) => (
            <TreeRow
              key={c.code}
              node={c}
              path={`${path}-${idx}`}
              depth={depth + 1}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              existingCodes={existingCodes}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
