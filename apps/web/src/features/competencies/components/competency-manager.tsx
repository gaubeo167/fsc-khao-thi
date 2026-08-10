"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderPlus,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetencyImportNode } from "@/lib/toc/parse-competencies";

import { CompetencyImportDialog } from "../dialogs/competency-import-dialog";
import {
  CompetencyNodeDialog,
  type CompetencyNodeDraft,
} from "../dialogs/competency-node-dialog";
import {
  bloomMeta,
  competencyKindMeta,
  type Competency,
  type CompetencyKind,
} from "../data/types";
import { useCompetenciesStore } from "../state/competencies-store";

interface Props {
  subjectId: string;
  gradeId: string | null;
  subjectName?: string;
  gradeName?: string;
}

const childKind: Record<CompetencyKind, CompetencyKind | null> = {
  chapter: "topic",
  topic: "outcome",
  outcome: null,
};

export function CompetencyManager({
  subjectId,
  gradeId,
  subjectName,
  gradeName,
}: Props) {
  const competencies = useCompetenciesStore((s) => s.competencies);
  const createCompetency = useCompetenciesStore((s) => s.createCompetency);
  const updateCompetency = useCompetenciesStore((s) => s.updateCompetency);
  const removeCompetency = useCompetenciesStore((s) => s.removeCompetency);

  const scoped = useMemo(
    () =>
      competencies.filter(
        (n) => n.subjectId === subjectId && n.gradeId === gradeId,
      ),
    [competencies, subjectId, gradeId],
  );
  const childrenOf = (parentId: string | null) =>
    scoped
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order);

  const counts = useMemo(() => {
    let ch = 0,
      tp = 0,
      oc = 0;
    for (const n of scoped) {
      if (n.kind === "chapter") ch++;
      else if (n.kind === "topic") tp++;
      else oc++;
    }
    return { ch, tp, oc };
  }, [scoped]);

  const existingCodes = useMemo(() => {
    const s = new Set<string>();
    for (const n of scoped) if (n.code) s.add(n.code);
    return s;
  }, [scoped]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [nodeDialog, setNodeDialog] = useState<
    | { mode: "add"; parentId: string | null; kind: CompetencyKind }
    | { mode: "edit"; node: Competency }
    | null
  >(null);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNodeSubmit(draft: CompetencyNodeDraft) {
    if (!nodeDialog) return;
    if (nodeDialog.mode === "add") {
      createCompetency({
        subjectId,
        gradeId,
        parentId: nodeDialog.parentId,
        kind: nodeDialog.kind,
        title: draft.title,
        code: draft.code,
        bloomLevel: draft.bloomLevel,
      });
    } else {
      updateCompetency(nodeDialog.node.id, {
        title: draft.title,
        code: draft.code,
        bloomLevel: draft.bloomLevel,
      });
    }
  }

  /** Import: dedupe by code (reuse existing node as parent), create new. */
  function applyCompetencyTree(tree: CompetencyImportNode[]) {
    const idByCode = new Map<string, string>();
    for (const n of scoped) if (n.code) idByCode.set(n.code, n.id);
    const insert = (nodes: CompetencyImportNode[], parentId: string | null) => {
      for (const node of nodes) {
        let id = node.code ? idByCode.get(node.code) : undefined;
        if (!id) {
          const created = createCompetency({
            subjectId,
            gradeId,
            parentId,
            kind: node.kind,
            title: node.title,
            code: node.code ?? null,
            bloomLevel: node.bloomLevel ?? null,
          });
          id = created.id;
          if (node.code) idByCode.set(node.code, id);
        }
        if (node.children && node.children.length > 0) insert(node.children, id);
      }
    };
    insert(tree, null);
  }

  const roots = childrenOf(null);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
            {counts.ch} chương
          </span>
          <span className="rounded-md bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">
            {counts.tp} chủ đề
          </span>
          <span className="rounded-md bg-teal-50 px-2 py-0.5 font-semibold text-teal-700">
            {counts.oc} YCCĐ
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {scoped.length > 0 && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCollapsed(new Set())}
                className="text-[12px]"
              >
                Mở hết
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCollapsed(
                    new Set(
                      scoped
                        .filter((n) => scoped.some((c) => c.parentId === n.id))
                        .map((n) => n.id),
                    ),
                  )
                }
                className="text-[12px]"
              >
                Thu hết
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setNodeDialog({ mode: "add", parentId: null, kind: "chapter" })
            }
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Thêm chương
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <FileText className="h-3.5 w-3.5" />
            Nhập từ Word
          </Button>
        </div>
      </div>

      {/* Tree */}
      {roots.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
          <Target className="mx-auto mb-2 h-9 w-9 text-muted-foreground/60" />
          <p className="text-[13px] font-semibold">Chưa có khung YCCĐ</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Tải file Word khung năng lực (có mã [SI10.01.1.D01]) để tự tạo cây
            Chương → Chủ đề → YCCĐ, hoặc thêm thủ công. Đây là kho riêng, tách
            khỏi mục lục lưu câu hỏi.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setImportOpen(true)}>
            <FileText className="h-3.5 w-3.5" />
            Nhập từ Word
          </Button>
        </div>
      ) : (
        <ul className="rounded-xl border bg-card px-2 py-1.5">
          {roots.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              depth={0}
              childrenOf={childrenOf}
              collapsed={collapsed}
              onToggle={toggle}
              onAddChild={(parent) => {
                const k = childKind[parent.kind];
                if (k) setNodeDialog({ mode: "add", parentId: parent.id, kind: k });
              }}
              onEdit={(node) => setNodeDialog({ mode: "edit", node })}
              onDelete={(node) => {
                const kids = scoped.filter((c) => c.parentId === node.id).length;
                const msg =
                  kids > 0
                    ? `Xoá "${node.title}" và toàn bộ ${kids} mục con?`
                    : `Xoá "${node.title}"?`;
                if (window.confirm(msg)) removeCompetency(node.id);
              }}
            />
          ))}
        </ul>
      )}

      <CompetencyImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        subjectName={subjectName}
        gradeName={gradeName}
        existingCodes={existingCodes}
        onApply={applyCompetencyTree}
      />
      {nodeDialog && (
        <CompetencyNodeDialog
          open
          onOpenChange={(o) => !o && setNodeDialog(null)}
          mode={nodeDialog.mode}
          kind={nodeDialog.mode === "add" ? nodeDialog.kind : nodeDialog.node.kind}
          initial={
            nodeDialog.mode === "edit"
              ? {
                  title: nodeDialog.node.title,
                  code: nodeDialog.node.code ?? null,
                  bloomLevel: nodeDialog.node.bloomLevel ?? null,
                }
              : undefined
          }
          onSubmit={handleNodeSubmit}
        />
      )}
    </div>
  );
}

function NodeRow({
  node,
  depth,
  childrenOf,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: Competency;
  depth: number;
  childrenOf: (parentId: string | null) => Competency[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (parent: Competency) => void;
  onEdit: (node: Competency) => void;
  onDelete: (node: Competency) => void;
}) {
  const kids = childrenOf(node.id);
  const hasKids = kids.length > 0;
  const isOpen = !collapsed.has(node.id);
  const level = competencyKindMeta(node.kind);
  const bloom = bloomMeta(node.bloomLevel ?? null);
  const canAddChild = node.kind !== "outcome";

  return (
    <li>
      <div
        className="group flex items-center gap-1.5 rounded px-1 py-1.5 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
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
        {node.code && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {node.code}
          </span>
        )}
        {bloom && (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              bloom.chipBg,
              bloom.chipFg,
            )}
            title={`Mức nhận thức: ${bloom.full}`}
          >
            {bloom.short}
          </span>
        )}
        <span className="truncate text-[13px] text-foreground/90">
          {node.title || <span className="italic text-muted-foreground">(chưa đặt tên)</span>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {canAddChild && (
            <button
              type="button"
              onClick={() => onAddChild(node)}
              title={`Thêm ${competencyKindMeta(childKind[node.kind]!).full}`}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(node)}
            title="Sửa"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(node)}
            title="Xoá"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {hasKids && isOpen && (
        <ul>
          {kids.map((c) => (
            <NodeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              childrenOf={childrenOf}
              collapsed={collapsed}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
