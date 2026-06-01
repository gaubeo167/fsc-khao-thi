"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PlayCircle,
  Save,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import type { Question, QuestionStatus } from "../data/seed-questions";
import { findQuestionType } from "../data/question-types";
import { useQuestionsStore } from "../state/questions-store";
import { RenderedContent } from "../components/rendered-content";
import { AiQuestionEditDialog } from "./ai-question-edit-dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}

interface AiQuestion {
  type: "mcq-single" | "mcq-multi" | "true-false" | "fill-blank";
  difficulty: "easy" | "medium" | "hard";
  content: string;
  explanation?: string;
  options?: Array<{ content: string; isCorrect: boolean }>;
  correctAnswer?: boolean;
  blanks?: Array<{ acceptedAnswers: string[] }>;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "review"; questions: AiQuestion[] }
  | { kind: "error"; message: string };

export function AiBatchDialog({ open, onOpenChange, onBack }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allSubjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const createQuestion = useQuestionsStore((s) => s.create);

  // Scope subjects to the current campus so a freshly-created campus
  // doesn't see subjects from other campuses leak into the dropdown.
  // Same shape as the filter in /admin/question-bank.
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const subjects = operatingCampusId
    ? allSubjects.filter(
        (s) =>
          !s.campusIds ||
          s.campusIds.length === 0 ||
          s.campusIds.includes(operatingCampusId),
      )
    : allSubjects;

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [tocNodeId, setTocNodeId] = useState<string>("");
  const [freeTags, setFreeTags] = useState("");
  const [description, setDescription] = useState("");
  const [count, setCount] = useState(5);
  const [questionType, setQuestionType] = useState<
    "mixed" | "mcq-single" | "mcq-multi" | "true-false" | "fill-blank"
  >("mixed");
  const [distribution, setDistribution] = useState<
    "even" | "easy-heavy" | "medium-heavy" | "hard-heavy"
  >("even");

  const [state, setState] = useState<State>({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const grade = grades.find((g) => g.id === gradeId);

  // TOC nodes filtered by subject + grade
  const availableTocs = useMemo(() => {
    if (!subjectId) return [];
    return tocNodes.filter(
      (n) => n.subjectId === subjectId && (gradeId ? n.gradeId === gradeId : true),
    );
  }, [tocNodes, subjectId, gradeId]);

  // Build TOC node path for AI context
  const topicPath = useMemo(() => {
    if (!tocNodeId) return undefined;
    const byId = new Map(tocNodes.map((n) => [n.id, n]));
    const parts: string[] = [];
    let cursor: string | null = tocNodeId;
    let safety = 8;
    while (cursor && safety-- > 0) {
      const node = byId.get(cursor);
      if (!node) break;
      parts.unshift(node.name);
      cursor = node.parentId;
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [tocNodes, tocNodeId]);

  async function generate() {
    if (!subjectId || !gradeId) {
      setState({
        kind: "error",
        message: "Vui lòng chọn môn học và khối ở phần trên.",
      });
      return;
    }
    if (!description.trim()) {
      setState({
        kind: "error",
        message: "Vui lòng mô tả chủ đề / kiến thức cần kiểm tra.",
      });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/generate-questions-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject?.name,
          grade: grade?.name,
          topic: topicPath,
          freeTags: freeTags.trim() || undefined,
          description,
          count,
          questionType,
          distribution,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? "Lỗi không xác định" });
        return;
      }
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (questions.length === 0) {
        setState({
          kind: "error",
          message: "AI không sinh được câu hỏi nào với mô tả trên — hãy thử mô tả cụ thể hơn.",
        });
        return;
      }
      // Warn when AI under-delivered (e.g. some invalid items got dropped
      // during parse). User sees the actual count vs requested before
      // committing to save.
      const received = Number(data.receivedCount ?? questions.length);
      const requested = Number(data.requestedCount ?? count);
      if (received < requested) {
        toast.warning(
          `AI chỉ sinh được ${received}/${requested} câu hợp lệ. Bấm "Tạo thêm" để bổ sung, hoặc lưu số đã có.`,
        );
      } else {
        toast.success(`Đã sinh ${received} câu hỏi — kiểm tra rồi lưu.`);
      }
      setState({ kind: "review", questions });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Không kết nối server",
      });
    }
  }

  function removeAt(idx: number) {
    if (state.kind !== "review") return;
    const next = state.questions.filter((_, i) => i !== idx);
    if (next.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    setState({ ...state, questions: next });
  }

  function updateAt(idx: number, patch: Partial<AiQuestion>) {
    if (state.kind !== "review") return;
    const next = state.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    setState({ ...state, questions: next });
  }

  function saveAll(target: "personal" | "campus") {
    if (state.kind !== "review") return;
    setSaveError(null);
    if (!session) {
      setSaveError("Không tìm thấy thông tin tài khoản.");
      return;
    }
    if (!subjectId || !gradeId) {
      setSaveError("Thiếu môn / khối.");
      return;
    }

    const resolvedCampusId =
      target === "personal"
        ? null
        : (session.campusId ?? activeCampusId ?? null);
    const status: QuestionStatus = target === "personal" ? "approved" : "pending";

    for (const q of state.questions) {
      const base = {
        content: q.content,
        explanation: q.explanation ?? null,
        subjectId,
        gradeId,
        tocNodeId: tocNodeId || null,
        difficulty: q.difficulty,
        tags: freeTags
          .split(/[·,]/)
          .map((t) => t.trim())
          .filter(Boolean),
        kho: target,
        campusId: resolvedCampusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status,
        approvedBy: status === "approved" ? session.userId : null,
        rejectionNote: null,
      };

      if (q.type === "mcq-single" || q.type === "mcq-multi") {
        createQuestion({
          ...base,
          type: q.type,
          options: (q.options ?? []).map((o, i) => ({
            id: `opt-${Date.now()}-${i}`,
            ...o,
          })),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">);
      } else if (q.type === "true-false") {
        createQuestion({
          ...base,
          type: "true-false",
          correctAnswer: Boolean(q.correctAnswer),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">);
      } else if (q.type === "fill-blank") {
        // Convert ___ markers in content into [blank:N] chips so the
        // saved question uses our standard format. Fall back to keeping
        // the original content if AI didn't use ___.
        const blankCount = (q.blanks ?? []).length;
        let n = 0;
        const content = q.content.replace(/_{3,}/g, () => {
          n += 1;
          return `[blank:${n}]`;
        });
        const finalContent = n > 0 ? content : q.content;
        createQuestion({
          ...base,
          content: finalContent,
          type: "fill-blank",
          blanks: (q.blanks ?? []).slice(0, blankCount || (q.blanks?.length ?? 0)),
        } as Omit<Question, "id" | "createdAt" | "updatedAt">);
      }
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl p-0 max-h-[94vh] overflow-y-auto"
        srTitle="AI tạo nhiều câu hỏi cùng lúc"
      >
        {/* Step indicator + close */}
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4 pr-12">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-200"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">
                1
              </span>
              Chọn loại
            </button>
            <span aria-hidden className="h-px w-6 bg-border" />
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                2
              </span>
              Soạn nội dung
            </span>
          </div>
        </header>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Meta — Subject / Grade / Difficulty */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Môn học" required>
              <Select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTocNodeId("");
                }}
              >
                <option value="">— Chọn môn —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Khối" required>
              <Select
                value={gradeId}
                onChange={(e) => {
                  setGradeId(e.target.value);
                  setTocNodeId("");
                }}
              >
                <option value="">— Chọn khối —</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* TOC + tags */}
          <Field label="Mục lục môn học (chương / chủ đề)">
            <Select
              value={tocNodeId}
              onChange={(e) => setTocNodeId(e.target.value)}
              disabled={!subjectId || availableTocs.length === 0}
            >
              <option value="">— Chọn chương/chủ đề trong mục lục —</option>
              {availableTocs.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Hoặc nhập tag tự do">
            <input
              value={freeTags}
              onChange={(e) => setFreeTags(e.target.value)}
              placeholder="VD: Đại số · Bài 3 · Phương trình tích"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </Field>

          {/* Description — yellow card */}
          <div className="space-y-2 rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-900">
              Chủ đề / kiến thức cần kiểm tra{" "}
              <span className="text-destructive">*</span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="VD: Phương trình bậc 2 và ứng dụng — Trọng tâm: công thức nghiệm, định lý Vi-ét, bài toán thực tế"
              className="block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus-visible:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
            />
            <p className="text-[12px] leading-relaxed text-amber-800/85">
              AI sẽ kết hợp chủ đề này với môn/khối/độ khó/mục lục đã chọn ở trên
              để soạn câu hỏi đúng nội dung kiến thức.
            </p>
          </div>

          {/* Generation params */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Số lượng câu">
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))
                }
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Loại câu hỏi">
              <Select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as typeof questionType)}
              >
                <option value="mixed">Hỗn hợp (AI tự chọn)</option>
                <option value="mcq-single">Chỉ trắc nghiệm 1 đáp án</option>
                <option value="mcq-multi">Chỉ trắc nghiệm nhiều đáp án</option>
                <option value="true-false">Chỉ Đúng / Sai</option>
                <option value="fill-blank">Chỉ điền khuyết</option>
              </Select>
            </Field>
          </div>

          <Field label="Phân bố độ khó">
            <Select
              value={distribution}
              onChange={(e) =>
                setDistribution(e.target.value as typeof distribution)
              }
            >
              <option value="even">Phân bố đều (30% NB · 50% TH · 20% VDC)</option>
              <option value="easy-heavy">Thiên nhận biết (60/30/10)</option>
              <option value="medium-heavy">Thiên thông hiểu (20/60/20)</option>
              <option value="hard-heavy">Thiên vận dụng (10/30/60)</option>
            </Select>
          </Field>

          {/* AI generate button */}
          <Button
            type="button"
            onClick={generate}
            disabled={state.kind === "loading"}
            className="w-full"
          >
            {state.kind === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {state.kind === "loading"
              ? `Đang tạo ${count} câu hỏi…`
              : "Tạo câu hỏi bằng AI"}
          </Button>

          {state.kind === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={1.85}
              />
              <div>
                <p className="font-semibold">Không sinh được câu hỏi</p>
                <p className="text-meta mt-0.5 leading-relaxed text-destructive-text/80">
                  {state.message}
                </p>
              </div>
            </div>
          )}

          {state.kind === "review" && (
            <ReviewList
              questions={state.questions}
              onRemove={removeAt}
              onUpdate={updateAt}
              onEdit={(idx) => setEditingIdx(idx)}
            />
          )}

          {saveError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {state.kind === "review" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveAll("personal")}
                >
                  <Save className="h-4 w-4" />
                  Lưu {state.questions.length} câu vào kho cá nhân
                </Button>
                <Button type="button" onClick={() => saveAll("campus")}>
                  <Send className="h-4 w-4" />
                  Gửi {state.questions.length} câu duyệt vào Kho trường
                </Button>
              </>
            )}
          </div>
        </footer>

        {/* Sub-dialog for full editing of a single AI question */}
        {state.kind === "review" && editingIdx !== null && (
          <AiQuestionEditDialog
            open={editingIdx !== null}
            onOpenChange={(o) => !o && setEditingIdx(null)}
            initial={{
              type: state.questions[editingIdx]!.type,
              content: state.questions[editingIdx]!.content,
              explanation: state.questions[editingIdx]!.explanation,
              difficulty: state.questions[editingIdx]!.difficulty,
              options: state.questions[editingIdx]!.options?.map((o, i) => ({
                id: `opt-${i}`,
                content: o.content,
                isCorrect: o.isCorrect,
              })),
              correctAnswer: state.questions[editingIdx]!.correctAnswer,
              blanks: state.questions[editingIdx]!.blanks,
            }}
            onSave={(v) => {
              const patch: Partial<AiQuestion> = {
                content: v.content,
                explanation: v.explanation,
                difficulty: v.difficulty,
              };
              if (v.options) {
                patch.options = v.options.map((o) => ({
                  content: o.content,
                  isCorrect: o.isCorrect,
                }));
              }
              if (typeof v.correctAnswer === "boolean") {
                patch.correctAnswer = v.correctAnswer;
              }
              if (v.blanks) patch.blanks = v.blanks;
              updateAt(editingIdx, patch);
              setEditingIdx(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

/* ─────────────────────── Review list ─────────────────────── */

function ReviewList({
  questions,
  onRemove,
  onUpdate,
  onEdit,
}: {
  questions: AiQuestion[];
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<AiQuestion>) => void;
  onEdit: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>
          AI đã sinh{" "}
          <span className="font-bold">{questions.length}</span> câu. Review và
          chỉnh sửa từng câu trước khi lưu.
        </span>
      </div>
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <ReviewCard
            key={i}
            idx={i}
            question={q}
            onRemove={() => onRemove(i)}
            onUpdate={(patch) => onUpdate(i, patch)}
            onEdit={() => onEdit(i)}
          />
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({
  idx,
  question,
  onRemove,
  onEdit,
}: {
  idx: number;
  question: AiQuestion;
  onRemove: () => void;
  onUpdate: (patch: Partial<AiQuestion>) => void;
  onEdit: () => void;
}) {
  const meta = findQuestionType(question.type);
  const difficultyLabel =
    question.difficulty === "easy"
      ? "Dễ"
      : question.difficulty === "medium"
        ? "TB"
        : "Khó";

  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold tabular-nums text-primary-text">
          {idx + 1}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${meta.color}1A`,
            color: meta.color,
          }}
        >
          {meta.shortName}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
          {difficultyLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-accent"
          >
            ✎ Sửa
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-destructive hover:bg-destructive/5"
          >
            <Trash2 className="inline h-3 w-3" /> Xoá
          </button>
        </div>
      </div>

      <div className="rounded-md border bg-surface p-2 text-[13px]">
        <RenderedContent content={question.content} />
      </div>

      {/* Read-only answer summary */}
      {question.type === "mcq-single" || question.type === "mcq-multi" ? (
        <ul className="mt-2 space-y-1 text-[12px]">
          {(question.options ?? []).map((o, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2 rounded border bg-surface px-2 py-1",
                o.isCorrect && "border-emerald-300 bg-emerald-50",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                  o.isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-foreground/70",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1">
                <RenderedContent content={o.content} />
              </span>
              {o.isCorrect && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                  Đúng
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : question.type === "true-false" ? (
        <p className="mt-2 text-[12px]">
          Đáp án đúng:{" "}
          <span
            className={cn(
              "ml-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
              question.correctAnswer
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700",
            )}
          >
            {question.correctAnswer ? "Đúng" : "Sai"}
          </span>
        </p>
      ) : question.type === "fill-blank" ? (
        <ul className="mt-2 space-y-1 text-[12px]">
          {(question.blanks ?? []).map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <span className="text-meta">Blank #{i + 1}:</span>
              {b.acceptedAnswers.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                >
                  <RenderedContent content={a} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      {question.explanation && (
        <div className="mt-2 flex items-start gap-1 text-[12px] italic text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
          <RenderedContent content={question.explanation} />
        </div>
      )}
    </li>
  );
}
