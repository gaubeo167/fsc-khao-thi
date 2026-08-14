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
import {
  frameworkTreeToCompetencies,
  type CompetencyImportNode,
} from "@/lib/toc/parse-competencies";
import { cn } from "@/lib/utils";

import {
  bloomMeta,
  competencyKindMeta,
} from "../data/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName?: string;
  gradeName?: string;
  /** YCCĐ codes already present for this subject+grade (mới / trùng). */
  existingCodes: Set<string>;
  /** Confirm — receives the parsed competency tree (kind + bloom + code). */
  onApply: (tree: CompetencyImportNode[]) => void;
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
      tree: CompetencyImportNode[];
      counts: Counts;
      fileName: string;
    }
  | { kind: "error"; message: string };

function allCodes(tree: CompetencyImportNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: CompetencyImportNode[]) => {
    for (const n of nodes) {
      out.push(n.code);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

export function CompetencyImportDialog({
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
      // Reuse the existing framework parser route; annotate → competency
      // tree (kind + inferred Bloom) on the client.
      const res = await fetch("/api/subjects/parse-framework", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          kind: "error",
          message: data.message ?? "Lỗi không xác định",
        });
        return;
      }
      const tree = frameworkTreeToCompetencies(data.tree as FrameworkNode[]);
      setState({
        kind: "result",
        tree,
        counts: data.counts as Counts,
        fileName: file.name,
      });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Không kết nối được tới server",
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
      <DialogContent srDescription="Nhập khung Yêu cầu cần đạt từ file Word, xem trước rồi xác nhận thêm vào kho."
        className="max-w-3xl p-0 max-h-[92vh] overflow-y-auto"
        srTitle="Tải khung YCCĐ từ file"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-200">
            <FileText className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">Tải Khung năng lực / YCCĐ (.docx)</h2>
            <p className="text-meta mt-0.5">
              {subjectName || "—"} · {gradeName || "—"} · tách Chương / Chủ đề /
              YCCĐ theo mã (vd [SI10.01.1.D01]); mức Bloom (Biết/Hiểu/Vận dụng)
              tự suy từ động từ — chỉnh lại được sau khi nhập.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {!result && state.kind !== "loading" && (
            <div className="rounded-lg border bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed">
              <p className="mb-1 font-semibold text-foreground/85">
                Quy ước file mẫu (giống khung kiến thức)
              </p>
              <ul className="space-y-0.5 text-foreground/75">
                <li>
                  • Chương:{" "}
                  <code className="rounded bg-muted px-1">[SI10.01]: 1. Tên chương</code>.
                </li>
                <li>
                  • Chủ đề:{" "}
                  <code className="rounded bg-muted px-1">1.1. Tên chủ đề</code>.
                </li>
                <li>
                  • YCCĐ: dòng mã{" "}
                  <code className="rounded bg-muted px-1">[SI10.01.1.D01]</code> rồi
                  dòng nội dung ngay dưới.
                </li>
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
              htmlFor="competency-file"
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
                  File Word theo mẫu khung YCCĐ — tối đa 8MB
                </p>
              </div>
            </label>
          )}
          <input
            ref={fileInputRef}
            id="competency-file"
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
                <p className="font-semibold">Không đọc được khung YCCĐ</p>
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
                  {result.counts.topics} chủ đề
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground/75">
                  {result.counts.indicators} YCCĐ
                </span>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  {newCount} mã mới sẽ thêm
                </span>
                {dupCount > 0 && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    {dupCount} mã đã có (bỏ qua)
                  </span>
                )}
              </div>
              <div className="max-h-[440px] overflow-y-auto rounded-lg border bg-surface px-3 py-2">
                <TreePreview nodes={result.tree} depth={0} existingCodes={existingCodes} />
              </div>
              <p className="text-meta mt-2 leading-relaxed">
                Chỉ các{" "}
                <span className="font-semibold text-emerald-700">mã mới</span> được
                thêm vào Khung YCCĐ. Mã đã tồn tại giữ nguyên (không đụng câu hỏi
                đã gắn). Mức Bloom là <span className="font-semibold">gợi ý</span>,
                sửa lại được sau khi nhập.
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
  nodes: CompetencyImportNode[];
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
  node: CompetencyImportNode;
  path: string;
  depth: number;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  existingCodes: Set<string>;
}) {
  const level = competencyKindMeta(node.kind);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isOpen = !collapsed.has(path);
  const isDup = existingCodes.has(node.code);
  const bloom = bloomMeta(node.bloomLevel ?? null);

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
        {bloom && (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              bloom.chipBg,
              bloom.chipFg,
            )}
          >
            {bloom.short}
          </span>
        )}
        <span className="truncate text-[13px] text-foreground/90">{node.title}</span>
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
