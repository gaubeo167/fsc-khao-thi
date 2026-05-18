"use client";

import { Check, Eye, Library, Lock, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { findQuestionType } from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { ViewQuestionDialog } from "@/features/question-bank/dialogs/view-question-dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  topicName: string;
  pool: Question[];
  initialSelected: string[];
  /**
   * Question ids that are already picked by OTHER mạch in the same blueprint.
   * Rows are shown but locked (not toggleable) so the user understands why
   * they can't pick them again.
   */
  excludedIds?: string[];
  onConfirm(picked: string[]): void;
}

/**
 * Lets the user pick a subset of questions for one mạch kiến thức. The
 * caller pre-filters the pool to the eligible set (kho campus + approved +
 * matching subject/grade), so this dialog only needs to handle UI search /
 * difficulty filtering + selection.
 */
export function PickQuestionsDialog({
  open,
  onOpenChange,
  topicName,
  pool,
  initialSelected,
  excludedIds = [],
  onConfirm,
}: Props) {
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Question["difficulty"] | "all">(
    "all",
  );
  const [hideLocked, setHideLocked] = useState(true);
  const [previewing, setPreviewing] = useState<Question | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pool.filter((q) => {
      if (hideLocked && excludedSet.has(q.id)) return false;
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      if (needle) {
        const tagsText = (q.tags ?? []).join(" ");
        const haystack = `${q.id} ${q.content} ${tagsText}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [pool, difficulty, search, hideLocked, excludedSet]);

  const lockedCount = useMemo(
    () => pool.filter((q) => excludedSet.has(q.id)).length,
    [pool, excludedSet],
  );

  function toggle(id: string) {
    if (excludedSet.has(id)) return; // can't pick from another mạch
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearAll() {
    setSelected(new Set());
  }

  const summary = useMemo(() => {
    let easy = 0,
      medium = 0,
      hard = 0;
    for (const q of pool) {
      if (!selected.has(q.id)) continue;
      if (q.difficulty === "easy") easy++;
      else if (q.difficulty === "medium") medium++;
      else hard++;
    }
    return { easy, medium, hard, total: selected.size };
  }, [pool, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 max-h-[94vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Library className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">
              Bốc câu hỏi từ ngân hàng — {topicName}
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Chỉ hiển thị câu hỏi <span className="font-semibold">kho nhà trường</span> đã
              được duyệt, trùng môn & khối với khung đề. Không hỗ trợ bốc từ
              kho cá nhân.
            </p>
          </div>
        </header>

        <div className="px-6 py-4">
          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo mã, nội dung, hoặc tag…"
                className="h-9 pl-7"
              />
            </div>
            <Select
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as Question["difficulty"] | "all")
              }
              className="h-9 min-w-[150px]"
            >
              <option value="all">Tất cả độ khó</option>
              <option value="easy">Nhận biết (NB)</option>
              <option value="medium">Thông hiểu (TH)</option>
              <option value="hard">Vận dụng cao (VDC)</option>
            </Select>
            {lockedCount > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">
                <input
                  type="checkbox"
                  checked={hideLocked}
                  onChange={(e) => setHideLocked(e.target.checked)}
                  className="h-3 w-3 accent-amber-600"
                />
                Ẩn {lockedCount} câu đã bốc ở mạch khác
              </label>
            )}
            <span className="ml-auto rounded-md bg-primary-soft px-2.5 py-1.5 text-[12px] font-semibold tabular-nums text-primary-text">
              Đã chọn: {summary.total} câu
            </span>
            {summary.total > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearAll}
                className="text-destructive"
              >
                Bỏ chọn tất cả
              </Button>
            )}
          </div>

          {/* Difficulty summary */}
          {summary.total > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12px]">
              <span className="font-semibold text-primary">Phân bổ:</span>
              <span className="text-emerald-700">
                <b>NB:</b> {summary.easy}
              </span>
              <span className="text-amber-700">
                <b>TH:</b> {summary.medium}
              </span>
              <span className="text-rose-700">
                <b>VDC:</b> {summary.hard}
              </span>
            </div>
          )}

          {/* List */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center">
              <p className="text-section-title">Không có câu hỏi phù hợp.</p>
              <p className="text-meta mt-1">
                Đảm bảo kho nhà trường có câu hỏi đã duyệt cho môn + khối tương
                ứng.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((q) => {
                const isSel = selected.has(q.id);
                const isLocked = excludedSet.has(q.id);
                const meta = findQuestionType(q.type);
                return (
                  <li key={q.id}>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                        isLocked
                          ? "border-amber-300 bg-amber-50/40 opacity-75"
                          : isSel
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-foreground/30 hover:bg-accent/30",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(q.id)}
                        disabled={isLocked}
                        title={
                          isLocked
                            ? "Câu này đã được bốc ở mạch khác trong cùng khung đề"
                            : isSel
                              ? "Bỏ chọn"
                              : "Chọn câu này"
                        }
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          isLocked
                            ? "cursor-not-allowed border-amber-300 bg-amber-100 text-amber-700"
                            : isSel
                              ? "border-primary bg-primary text-white"
                              : "border-foreground/25 bg-card hover:border-primary/60",
                        )}
                      >
                        {isLocked ? (
                          <Lock className="h-3 w-3" strokeWidth={2.5} />
                        ) : isSel ? (
                          <Check className="h-3 w-3" strokeWidth={3} />
                        ) : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggle(q.id)}
                        disabled={isLocked}
                        className={cn(
                          "min-w-0 flex-1 text-left",
                          isLocked && "cursor-not-allowed",
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                            {q.id}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                            style={{
                              backgroundColor: `${meta.color}1A`,
                              color: meta.color,
                            }}
                          >
                            {meta.shortName}
                          </span>
                          <DifficultyBadge difficulty={q.difficulty} />
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
                              Đã bốc ở mạch khác
                            </span>
                          )}
                        </div>
                        <div className="text-[13px]">
                          <RenderedContent inline content={q.content} />
                        </div>
                        {q.tags && q.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {q.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>

                      <IconButton
                        size="sm"
                        title="Xem chi tiết câu hỏi"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewing(q);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
            Hủy
          </Button>
          <Button onClick={() => onConfirm(Array.from(selected))}>
            <Check className="h-4 w-4" />
            Xác nhận {summary.total} câu
          </Button>
        </footer>
      </DialogContent>

      <ViewQuestionDialog
        question={previewing}
        onClose={() => setPreviewing(null)}
      />
    </Dialog>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Question["difficulty"] }) {
  const cfg =
    difficulty === "easy"
      ? { label: "NB", className: "bg-emerald-100 text-emerald-700" }
      : difficulty === "medium"
        ? { label: "TH", className: "bg-amber-100 text-amber-700" }
        : { label: "VDC", className: "bg-rose-100 text-rose-700" };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}
