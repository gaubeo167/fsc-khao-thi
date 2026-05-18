"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, type Control, type UseFormWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import {
  TOC_LEVELS,
  type TocNode,
} from "@/features/subjects/data/seed-toc";
import { cn } from "@/lib/utils";

interface Props {
  control: Control<any>;
  watch: UseFormWatch<any>;
}

/**
 * Cascading TOC selector + free-form tag chip input. Cascades depend on
 * subject + grade chosen above (both belong to `SharedMetaFields`).
 */
export function TocTagFields({ control, watch }: Props) {
  const subjectId = watch("subjectId") as string;
  const gradeId = watch("gradeId") as string;
  const tocNodes = useSubjectsStore((s) => s.tocNodes);

  const { flattened, fallbackUsed } = useMemo(() => {
    if (!subjectId) return { flattened: [], fallbackUsed: false };
    // Primary: exact (subject, grade) match.
    let inScope = tocNodes.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
    let fellBack = false;
    // Fallback: if the admin only built TOC for one grade of this
    // subject, reuse it for other grades so the dropdown isn't empty.
    if (inScope.length === 0) {
      inScope = tocNodes.filter((n) => n.subjectId === subjectId);
      if (inScope.length > 0) fellBack = true;
    }
    const byParent = new Map<string | null, TocNode[]>();
    for (const n of inScope) {
      const list = byParent.get(n.parentId) ?? [];
      list.push(n);
      byParent.set(n.parentId, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

    const out: Array<{ id: string; label: string; depth: number }> = [];
    function walk(parentId: string | null, depth: number) {
      const children = byParent.get(parentId) ?? [];
      for (const c of children) {
        out.push({
          id: c.id,
          label: c.name,
          depth,
        });
        walk(c.id, depth + 1);
      }
    }
    walk(null, 0);
    return { flattened: out, fallbackUsed: fellBack };
  }, [subjectId, gradeId, tocNodes]);

  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="tocNodeId"
        render={({ field }) => (
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              Mục lục môn học (chương / chủ đề)
            </Label>
            <Select
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value || null)}
              disabled={!subjectId}
            >
              <option value="">
                {!subjectId
                  ? "Chọn môn trước"
                  : "— Chọn chương / chủ đề trong mục lục —"}
              </option>
              {flattened.map((n) => {
                const lvl = TOC_LEVELS[Math.min(n.depth, TOC_LEVELS.length - 1)]!;
                return (
                  <option key={n.id} value={n.id}>
                    {"—".repeat(n.depth)} {n.depth > 0 ? " " : ""}[{lvl.short}] {n.label}
                  </option>
                );
              })}
            </Select>
            {subjectId && fallbackUsed && (
              <p className="text-[11px] text-amber-700">
                Khối hiện tại chưa có mục lục riêng — đang hiển thị mục lục
                được tạo cho khối khác của cùng môn này.
              </p>
            )}
            {subjectId && flattened.length === 0 && (
              <p className="text-meta">
                Môn này chưa có mục lục nào. Tạo ở mục{" "}
                <code className="rounded bg-muted px-1">Môn học → Mục lục</code>.
              </p>
            )}
          </div>
        )}
      />

      <TagsInput control={control} />
    </div>
  );
}

function TagsInput({ control }: { control: Control<any> }) {
  const [draft, setDraft] = useState("");
  return (
    <Controller
      control={control}
      name="tags"
      render={({ field }) => {
        const value: string[] = Array.isArray(field.value) ? field.value : [];
        function add() {
          const v = draft.trim();
          if (!v || value.includes(v)) {
            setDraft("");
            return;
          }
          field.onChange([...value, v]);
          setDraft("");
        }
        function remove(i: number) {
          field.onChange(value.filter((_, idx) => idx !== i));
        }
        return (
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              Tag tự do
            </Label>
            <div
              className={cn(
                "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
                "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
              )}
            >
              {value.map((v, i) => (
                <span
                  key={`${v}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
                >
                  {v}
                  <button
                    type="button"
                    aria-label="Xoá tag"
                    onClick={() => remove(i)}
                    className="rounded p-0.5 hover:bg-primary/15"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="Nhập tag rồi Enter…"
                className="h-7 flex-1 min-w-[140px] border-0 bg-transparent px-0.5 shadow-none focus-visible:ring-0"
              />
              {draft.trim() && (
                <button
                  type="button"
                  onClick={add}
                  title="Thêm tag"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/8 px-2 text-[12px] font-medium text-primary hover:bg-primary/15"
                >
                  <Plus className="h-3 w-3" />
                  Thêm
                </button>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
