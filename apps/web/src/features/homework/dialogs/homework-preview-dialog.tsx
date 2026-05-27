"use client";

import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Lightbulb,
  ListChecks,
  Paperclip,
  Play,
  XCircle,
} from "lucide-react";

import {
  FILE_TYPE_LABEL,
  formatFileSize,
} from "@/features/learning-materials/data/types";
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
import type { LearningMaterial } from "@/features/learning-materials/data/types";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { isCorrect } from "@/features/shift-exam/lib/is-correct";
import { QuestionRenderer } from "@/features/shift-exam/components/question-renderer";
import type { Answer } from "@/features/shift-exam/state/attempts-store";
import { cn } from "@/lib/utils";

const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionIds: string[];
  materialIds: string[];
  title: string;
}

type Mode = "review" | "trial";

/**
 * Two-in-one preview:
 *   - Review mode: see all questions in order, with the correct answer
 *     marked. No interactivity — for proofreading before publishing.
 *   - Trial mode: actually answer the questions like a student would.
 *     Shows immediate feedback (right/wrong) when you submit.
 */
export function HomeworkPreviewDialog({
  open,
  onOpenChange,
  questionIds,
  materialIds,
  title,
}: Props) {
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allMaterials = useMaterialsStore((s) => s.materials);

  const questions = useMemo(
    () =>
      questionIds
        .map((qid) => allQuestions.find((q) => q.id === qid))
        .filter((q): q is Question => !!q),
    [questionIds, allQuestions],
  );
  const materials = useMemo(
    () =>
      materialIds
        .map((mid) => allMaterials.find((m) => m.id === mid))
        .filter((m): m is LearningMaterial => !!m),
    [materialIds, allMaterials],
  );

  const [mode, setMode] = useState<Mode>("review");
  const [idx, setIdx] = useState(0);
  const [trialAnswers, setTrialAnswers] = useState<Record<string, Answer>>({});
  const [trialSubmitted, setTrialSubmitted] = useState(false);
  const [viewingMaterial, setViewingMaterial] =
    useState<LearningMaterial | null>(null);

  // IMPORTANT: keep all hook calls above any early returns. A previous
  // version of this file ran `useMemo(trialScore)` AFTER `if (!open)
  // return null`, which produced different hook counts between open
  // and closed states and crashed React with "Rendered more hooks
  // than during the previous render."
  /** Group questions by type and emit a sidebar-friendly count list.
   *  Each entry has a colored dot that doubles as a visual key. */
  const typeCounts = useMemo(() => {
    const groups = new Map<string, number>();
    for (const q of questions) {
      groups.set(q.type, (groups.get(q.type) ?? 0) + 1);
    }
    const TYPE_META: Record<
      string,
      { label: string; dotClass: string }
    > = {
      "mcq-single": { label: "Trắc nghiệm", dotClass: "bg-blue-500" },
      "mcq-multi": { label: "Nhiều đáp án", dotClass: "bg-blue-400" },
      "true-false": { label: "Đúng / Sai", dotClass: "bg-emerald-500" },
      "multi-tf": { label: "Đa Đ/S", dotClass: "bg-emerald-400" },
      "short-answer": { label: "Trả lời ngắn", dotClass: "bg-violet-500" },
      "fill-blank": { label: "Điền từ", dotClass: "bg-cyan-500" },
      matching: { label: "Ghép cặp", dotClass: "bg-rose-500" },
      ordering: { label: "Sắp xếp", dotClass: "bg-amber-500" },
      "drag-drop": { label: "Kéo thả", dotClass: "bg-fuchsia-500" },
      underline: { label: "Gạch chân", dotClass: "bg-teal-500" },
    };
    return [...groups.entries()]
      .map(([type, count]) => ({
        type,
        count,
        label: TYPE_META[type]?.label ?? type,
        dotClass: TYPE_META[type]?.dotClass ?? "bg-zinc-400",
      }))
      .sort((a, b) => b.count - a.count);
  }, [questions]);

  /** Difficulty breakdown — fixed 3 buckets so the sidebar layout
   *  doesn't jump when easy/medium/hard counts change. */
  const difficultyCounts = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const q of questions) {
      counts[q.difficulty]++;
    }
    return [
      {
        value: "easy" as const,
        label: "Dễ",
        count: counts.easy,
        iconClass: "text-emerald-600",
      },
      {
        value: "medium" as const,
        label: "Trung bình",
        count: counts.medium,
        iconClass: "text-amber-600",
      },
      {
        value: "hard" as const,
        label: "Khó",
        count: counts.hard,
        iconClass: "text-rose-600",
      },
    ];
  }, [questions]);

  const trialScore = useMemo(() => {
    if (!trialSubmitted) return null;
    let correct = 0;
    for (const q of questions) {
      const a = trialAnswers[q.id];
      if (a && isCorrect(q, a)) correct++;
    }
    return { correct, total: questions.length };
  }, [trialSubmitted, questions, trialAnswers]);

  function reset() {
    setIdx(0);
    setTrialAnswers({});
    setTrialSubmitted(false);
  }
  function trialSubmit() {
    setTrialSubmitted(true);
  }
  function trialReset() {
    setTrialAnswers({});
    setTrialSubmitted(false);
    setIdx(0);
  }

  const currentQ = questions[idx];
  // The outer Dialog component already handles open=false by not
  // rendering anything, so no manual early return is necessary.

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        // Force a fixed height so the inner overflow-y-auto always has
        // a concrete container to scroll inside. `max-h` was being
        // beaten by the natural content height when a homework had
        // many long questions in edit mode — the dialog grew taller
        // than viewport instead of shrinking. `gap-0` overrides the
        // base `gap-4` so flex children sit flush.
        className="flex h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header — purple gradient + icon, same flavour as form */}
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <ClipboardList className="h-5 w-5" strokeWidth={1.85} />
              </span>
              <div>
                <DialogTitle className="text-[16px]">
                  {title || "Xem trước BTVN"}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  {questions.length} câu · {materials.length} học liệu đính
                  kèm
                </DialogDescription>
              </div>
            </div>
            <div className="inline-flex shrink-0 rounded-xl border bg-card p-1">
              <ModeTab
                active={mode === "review"}
                onClick={() => {
                  setMode("review");
                  reset();
                }}
                icon={Eye}
                label="Xem trước"
              />
              <ModeTab
                active={mode === "trial"}
                onClick={() => {
                  setMode("trial");
                  reset();
                }}
                icon={Play}
                label="Làm thử"
              />
            </div>
          </div>
        </DialogHeader>

        {questions.length === 0 ? (
          <div className="px-5 py-10 text-center text-meta">
            Chưa có câu hỏi nào để xem trước. Quay lại và chọn câu hỏi.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_240px] overflow-hidden">
            {/* Main — scrollable */}
            <div className="min-w-0 overflow-y-auto px-5 py-4">
              {mode === "review" ? (
                <ReviewBody questions={questions} />
              ) : trialScore != null ? (
                <TrialResult
                  questions={questions}
                  answers={trialAnswers}
                  correct={trialScore.correct}
                  total={trialScore.total}
                  onRetry={trialReset}
                />
              ) : currentQ ? (
                <>
                  <p className="mb-2 text-meta">
                    Câu {idx + 1} / {questions.length} · {currentQ.type} ·{" "}
                    {currentQ.difficulty}
                  </p>
                  {/* Skip raw content for types whose QuestionRenderer
                      already prints the passage interactively — else
                      we'd duplicate the prompt and leak the answer
                      markers ([u:...] / [zone:N]). */}
                  {currentQ.type !== "drag-drop" &&
                    currentQ.type !== "underline" && (
                      <RenderedContent
                        content={
                          currentQ.type === "fill-blank"
                            ? currentQ.content.replace(
                                /\[blank:\d+\]/g,
                                "_____",
                              )
                            : currentQ.content
                        }
                      />
                    )}
                  <div className="mt-3">
                    <QuestionRenderer
                      question={currentQ}
                      answer={trialAnswers[currentQ.id]}
                      onChange={(a) =>
                        setTrialAnswers((prev) => ({
                          ...prev,
                          [currentQ.id]: a,
                        }))
                      }
                      seed={`preview-${currentQ.id}`}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {/* Sidebar — materials + breakdown + tip */}
            <aside className="space-y-4 overflow-y-auto border-l bg-muted/10 px-4 py-4">
              {mode === "trial" && !trialSubmitted && (
                <div>
                  <p className="mb-2 text-[12px] font-semibold text-foreground/70">
                    Lưới câu hỏi
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {questions.map((q, i) => {
                      const answered = Boolean(trialAnswers[q.id]);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setIdx(i)}
                          className={cn(
                            "h-8 rounded-md border text-[11.5px] font-semibold",
                            i === idx
                              ? "border-primary bg-primary text-primary-foreground"
                              : answered
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-border bg-card text-foreground/70 hover:bg-accent/30",
                          )}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {materials.length > 0 && (
                <div>
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground/80">
                    <Paperclip className="h-3.5 w-3.5 text-amber-600" />
                    Học liệu đính kèm
                  </p>
                  <ul className="space-y-1.5">
                    {materials.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setViewingMaterial(m)}
                          className="flex w-full items-start gap-2 rounded-lg border bg-card p-2.5 text-left hover:bg-accent/30"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-[12px] font-medium">
                              {m.title}
                            </p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {FILE_TYPE_LABEL[m.fileType]}
                              {m.sizeBytes > 0 ? ` · ${formatFileSize(m.sizeBytes)}` : ""}
                            </p>
                          </div>
                          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tổng quan bài — counts by type + difficulty */}
              {mode === "review" && (
                <div>
                  <p className="mb-2 text-[12px] font-semibold text-foreground/80">
                    Tổng quan bài
                  </p>
                  <ul className="space-y-1.5 text-[12px]">
                    <li className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-foreground/85">
                        <ListChecks className="h-3.5 w-3.5 text-blue-600" />
                        Tổng số câu
                      </span>
                      <span className="font-bold tabular-nums">
                        {questions.length}
                      </span>
                    </li>
                    {typeCounts.map((tc) => (
                      <li
                        key={tc.type}
                        className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5"
                      >
                        <span className="inline-flex items-center gap-1.5 text-foreground/85">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              tc.dotClass,
                            )}
                          />
                          {tc.label}
                        </span>
                        <span className="font-bold tabular-nums">
                          {tc.count}
                        </span>
                      </li>
                    ))}
                    {/* Difficulty distribution — shows only buckets with
                        at least one question to avoid noise. */}
                    {difficultyCounts.map((dc) =>
                      dc.count > 0 ? (
                        <li
                          key={dc.value}
                          className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5"
                        >
                          <span className="inline-flex items-center gap-1.5 text-foreground/85">
                            <Activity
                              className={cn("h-3.5 w-3.5", dc.iconClass)}
                            />
                            Mức độ {dc.label.toLowerCase()}
                          </span>
                          <span className="font-bold tabular-nums">
                            {dc.count}
                          </span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              )}

              {/* Mẹo — friendly tip */}
              {mode === "review" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-900">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                    Mẹo
                  </p>
                  <p className="text-[11.5px] leading-relaxed text-amber-800">
                    Nhấn <b>"Làm thử"</b> để trải nghiệm bài tập như học sinh.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}

        {questions.length > 0 && mode === "trial" && !trialSubmitted && (
          <footer className="flex shrink-0 items-center justify-between border-t bg-muted/15 px-5 py-3">
            <Button
              variant="outline"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Câu trước
            </Button>
            <Button variant="outline" onClick={trialSubmit}>
              <CheckCircle2 className="h-4 w-4" />
              Nộp thử
            </Button>
            <Button
              variant="outline"
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              disabled={idx === questions.length - 1}
            >
              Câu sau
              <ChevronRight className="h-4 w-4" />
            </Button>
          </footer>
        )}

        <MaterialViewerDialog
          material={viewingMaterial}
          onClose={() => setViewingMaterial(null)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Cycling palette for the numbered question badges — matches the
 *  mockup where each card gets a different colored block. */
const BADGE_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
] as const;

const QUESTION_TYPE_LABEL: Record<string, string> = {
  "mcq-single": "trắc nghiệm",
  "mcq-multi": "trắc nghiệm",
  "true-false": "đúng / sai",
  "multi-tf": "đa Đ/S",
  "short-answer": "trả lời ngắn",
  "fill-blank": "điền từ",
  matching: "ghép cặp",
  ordering: "sắp xếp",
  "drag-drop": "kéo thả",
  underline: "gạch chân",
  essay: "tự luận",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "dễ",
  medium: "trung bình",
  hard: "khó",
};

function ReviewBody({ questions }: { questions: Question[] }) {
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => {
        const badgeColor = BADGE_COLORS[i % BADGE_COLORS.length]!;
        return (
          <li
            key={q.id}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div className="flex items-start gap-3 p-4">
              {/* Numbered colored badge on the left */}
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[14px] font-bold",
                  badgeColor,
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{q.id}</span>
                  <span>·</span>
                  <span>{QUESTION_TYPE_LABEL[q.type] ?? q.type}</span>
                  <span>·</span>
                  <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
                </div>
                <div className="text-[13.5px] font-semibold text-foreground">
                  <span className="mr-1">Câu {i + 1}:</span>
                  <RenderedContent content={q.content} />
                </div>
                <CorrectAnswerHint q={q} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CorrectAnswerHint({ q }: { q: Question }) {
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return (
        <ul className="grid grid-cols-2 gap-2 text-[12.5px]">
          {q.options.map((o) => (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2",
                o.isCorrect
                  ? "border-emerald-300 bg-emerald-50/60 text-emerald-800"
                  : "border-border bg-background text-foreground/75",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  o.isCorrect
                    ? "border-emerald-600 bg-emerald-500 text-white"
                    : "border-border bg-background",
                )}
              >
                {o.isCorrect ? (
                  <CheckCircle2
                    className="h-3 w-3"
                    strokeWidth={3}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.content}</span>
              {o.isCorrect && (
                <span className="rounded-md bg-emerald-200/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  Đã chọn
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    case "true-false":
      return (
        <p className="text-[12.5px] text-emerald-700">
          Đáp án đúng: <b>{q.correctAnswer ? "Đúng" : "Sai"}</b>
        </p>
      );
    case "multi-tf":
      return (
        <ul className="space-y-1 text-[12.5px]">
          {q.subQuestions.map((s) => (
            <li key={s.id} className="text-foreground/80">
              {s.statement} —{" "}
              <b className="text-emerald-700">
                {s.correctAnswer ? "Đúng" : "Sai"}
              </b>
            </li>
          ))}
        </ul>
      );
    case "short-answer":
      return (
        <p className="text-[12.5px] text-emerald-700">
          Đáp án chấp nhận: <b>{q.acceptedAnswers.join(" / ")}</b>
        </p>
      );
    case "fill-blank":
      return (
        <ol className="list-decimal pl-5 text-[12.5px] text-emerald-700">
          {q.blanks.map((b, i) => (
            <li key={i}>
              <b>{b.acceptedAnswers.join(" / ")}</b>
            </li>
          ))}
        </ol>
      );
    default:
      return (
        <p className="text-[12px] text-muted-foreground">
          (Đáp án dạng câu hỏi này hiển thị đầy đủ ở chế độ "Làm thử".)
        </p>
      );
  }
}

function TrialResult({
  questions,
  answers,
  correct,
  total,
  onRetry,
}: {
  questions: Question[];
  answers: Record<string, Answer>;
  correct: number;
  total: number;
  onRetry: () => void;
}) {
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-center">
        <p className="text-section-title">Kết quả làm thử</p>
        <p className="mt-2 text-[34px] font-bold">
          {correct}
          <span className="text-foreground/40">/{total}</span>
        </p>
        <p className="text-meta">Đúng {percent}%</p>
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          Làm lại
        </Button>
      </div>
      <ol className="space-y-2">
        {questions.map((q, i) => {
          const a = answers[q.id];
          const right = a ? isCorrect(q, a) : false;
          return (
            <li
              key={q.id}
              className="flex items-start gap-2 rounded-md border bg-card p-3"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  right
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700",
                )}
              >
                {right ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] text-muted-foreground">
                  Câu {i + 1} · {q.type}
                </p>
                <div className="text-[12.5px]">
                  <RenderedContent content={q.content} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ModeTab({
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
