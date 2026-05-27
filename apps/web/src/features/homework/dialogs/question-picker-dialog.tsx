"use client";

import {
  Building2,
  Check,
  CheckSquare,
  Eye,
  Search,
  User,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import {
  TOC_LEVELS,
  type TocNode,
} from "@/features/subjects/data/seed-toc";
import { findQuestionType } from "@/features/question-bank/data/question-types";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";

const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);
import { cn } from "@/lib/utils";

import { HOMEWORK_QUESTION_TYPES } from "../data/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently-selected ids. Caller manages persistence; this picker
   *  just exposes a draft selection that becomes authoritative when
   *  user clicks "Xác nhận". */
  selectedIds: string[];
  /** Called on confirm with the new id list. */
  onConfirm: (ids: string[]) => void;

  /** Filter scope from parent context. */
  subjectId: string;
  gradeId?: string | null;
  campusId: string | null;
}

type KhoView = "campus" | "personal";

/**
 * Full-fledged question picker. Sits over the homework form dialog
 * and lets the teacher cherry-pick from Kho cá nhân vs Kho trường
 * with filters and search.
 *
 * Only auto-gradable types are listed (HOMEWORK_QUESTION_TYPES) — BTVN
 * scoring is plain correct/wrong count.
 */
export function QuestionPickerDialog({
  open,
  onOpenChange,
  selectedIds,
  onConfirm,
  subjectId,
  gradeId,
  campusId,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const subjects = useSubjectsStore((s) => s.subjects);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  const [kho, setKho] = useState<KhoView>("campus");
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [tocNodeId, setTocNodeId] = useState<string>("all");
  const [viewing, setViewing] = useState<Question | null>(null);

  // Reset draft whenever the dialog opens so an inadvertent cancel
  // doesn't drop earlier selections (we re-seed from props).
  if (open && draft.length === 0 && selectedIds.length > 0) {
    setDraft(selectedIds);
  }

  // TOC list scoped to subject (+ gradeId fallback) — same logic as
  // homework form. Built lazily so closed dialogs don't recompute.
  const tocOptions = useMemo(() => {
    if (!subjectId) return [];
    let inScope = tocNodes.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
    if (inScope.length === 0) {
      inScope = tocNodes.filter((n) => n.subjectId === subjectId);
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
      for (const c of byParent.get(parentId) ?? []) {
        out.push({ id: c.id, label: c.name, depth });
        walk(c.id, depth + 1);
      }
    }
    walk(null, 0);
    return out;
  }, [subjectId, gradeId, tocNodes]);

  const pool = useMemo(() => {
    const sq = search.trim().toLowerCase();
    return allQuestions
      .filter((q) => {
        if (q.archivedAt) return false;
        if (!HOMEWORK_QUESTION_TYPES.has(q.type)) return false;
        if (subjectId && q.subjectId !== subjectId) return false;
        if (gradeId && q.gradeId && q.gradeId !== gradeId) return false;
        if (campusId && q.campusId && q.campusId !== campusId) return false;
        // Kho filter.
        if (kho === "personal") {
          if (!(q.kho === "personal" && q.ownerId === session?.userId)) {
            return false;
          }
        } else {
          if (!(q.kho === "campus" && q.status === "approved")) return false;
        }
        if (difficulty !== "all" && q.difficulty !== difficulty) return false;
        if (type !== "all" && q.type !== type) return false;
        if (tocNodeId !== "all" && q.tocNodeId !== tocNodeId) return false;
        if (sq) {
          const hay = `${q.content} ${q.tags.join(" ")} ${q.id}`.toLowerCase();
          if (!hay.includes(sq)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [
    allQuestions,
    search,
    subjectId,
    gradeId,
    campusId,
    kho,
    difficulty,
    type,
    tocNodeId,
    session?.userId,
  ]);

  function toggle(qid: string) {
    setDraft((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid],
    );
  }
  function selectAllVisible() {
    setDraft((prev) => {
      const set = new Set(prev);
      for (const q of pool) set.add(q.id);
      return [...set];
    });
  }
  function clearVisible() {
    setDraft((prev) => prev.filter((id) => !pool.some((q) => q.id === id)));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent
        className="flex h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <CheckSquare className="h-5 w-5" strokeWidth={1.85} />
            </span>
            <div>
              <DialogTitle className="text-[16px]">
                Chọn câu hỏi từ ngân hàng
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {subject ? `Đang lọc môn ${subject.name}` : "Hãy chọn môn trước"}
                {gradeId ? ` · khối liên quan` : ""} · chỉ hiển thị câu hỏi
                tự chấm được
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Kho tabs */}
        <div className="shrink-0 border-b px-5 py-2">
          <div className="inline-flex rounded-xl border bg-card p-1">
            <KhoTab
              active={kho === "campus"}
              onClick={() => setKho("campus")}
              icon={Building2}
              label="Kho trường"
            />
            <KhoTab
              active={kho === "personal"}
              onClick={() => setKho("personal")}
              icon={User}
              label="Kho cá nhân"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b px-5 py-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Độ khó</Label>
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="h-9"
            >
              <option value="all">Tất cả</option>
              <option value="easy">Dễ</option>
              <option value="medium">Trung bình</option>
              <option value="hard">Khó</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Loại câu</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9"
            >
              <option value="all">Tất cả</option>
              {[...HOMEWORK_QUESTION_TYPES].map((t) => {
                const meta = findQuestionType(t as Question["type"]);
                return (
                  <option key={t} value={t}>
                    {meta?.name ?? t}
                  </option>
                );
              })}
            </Select>
          </div>
          {tocOptions.length > 0 ? (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Mục lục</Label>
              <Select
                value={tocNodeId}
                onChange={(e) => setTocNodeId(e.target.value)}
                className="h-9"
              >
                <option value="all">Mọi chương / chủ đề</option>
                {tocOptions.map((n) => {
                  const lvl =
                    TOC_LEVELS[Math.min(n.depth, TOC_LEVELS.length - 1)]!;
                  return (
                    <option key={n.id} value={n.id}>
                      {"—".repeat(n.depth)} {n.depth > 0 ? " " : ""}[{lvl.short}]{" "}
                      {n.label}
                    </option>
                  );
                })}
              </Select>
            </div>
          ) : null}
        </div>

        {/* Search + bulk actions */}
        <div className="flex shrink-0 items-center gap-2 border-b px-5 py-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo nội dung / tag / mã câu hỏi…"
              className="h-9 pl-8"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={selectAllVisible}
            disabled={pool.length === 0}
          >
            Chọn tất cả hiển thị
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearVisible}
          >
            <X className="h-4 w-4" />
            Bỏ chọn hiển thị
          </Button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {pool.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/15 px-6 py-10 text-center">
              <p className="text-section-title">
                Không có câu hỏi nào phù hợp với bộ lọc.
              </p>
              <p className="text-meta mt-1">
                {kho === "personal" ? (
                  <>
                    Kho cá nhân của bạn chưa có câu hỏi tự chấm phù hợp. Tạo
                    thêm ở Ngân hàng câu hỏi → Kho cá nhân.
                  </>
                ) : (
                  <>
                    Kho trường chưa có câu hỏi đã duyệt thuộc môn/khối này.
                    Liên hệ TBM hoặc dùng kho cá nhân.
                  </>
                )}
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pool.map((q) => {
                const checked = draft.includes(q.id);
                const meta = findQuestionType(q.type);
                return (
                  <li key={q.id}>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/30",
                        checked && "border-primary bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(q.id)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {checked ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <RenderedContent
                            content={q.content}
                            hideUnderlineMarks
                            className="line-clamp-2 text-[13px] leading-snug"
                          />
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{q.id}</span>
                            {meta && (
                              <span
                                className="rounded px-1.5 py-0.5 font-semibold"
                                style={{
                                  backgroundColor: `${meta.color}1A`,
                                  color: meta.color,
                                }}
                              >
                                {meta.name}
                              </span>
                            )}
                            <span className="rounded bg-foreground/8 px-1.5 py-0.5">
                              {DIFFICULTY_LABEL[q.difficulty]}
                            </span>
                            {q.tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-muted/40 px-1.5 py-0.5"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewing(q);
                        }}
                        title="Xem chi tiết câu hỏi"
                        className="rounded-md border bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t bg-muted/15 px-5 py-3">
          <p className="text-[12.5px] font-medium text-foreground/80">
            Đã chọn <span className="text-primary">{draft.length}</span> câu
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => {
                onConfirm(draft);
                onOpenChange(false);
              }}
            >
              Xác nhận ({draft.length})
            </Button>
          </div>
        </footer>

        <ViewQuestionDialog
          question={viewing}
          onClose={() => setViewing(null)}
        />
      </DialogContent>
    </Dialog>
  );
}

function KhoTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Dễ",
  medium: "TB",
  hard: "Khó",
};

function plainText(s: string): string {
  return s
    .replace(/!\[.*?\]\(.*?\)/g, "[ảnh]")
    .replace(/\[u:([^\]]+)\]/g, "$1")
    .replace(/\[zone:\d+\]/g, "___")
    .replace(/\s+/g, " ")
    .trim();
}
