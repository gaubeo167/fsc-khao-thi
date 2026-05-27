"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Paperclip,
  Play,
  XCircle,
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
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden p-0"
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

            {/* Sidebar — question grid + materials */}
            <aside className="space-y-3 overflow-y-auto border-l bg-muted/10 px-3 py-4">
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
                  <p className="mb-2 inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
                    <Paperclip className="h-3.5 w-3.5" />
                    Học liệu đính kèm
                  </p>
                  <ul className="space-y-1.5">
                    {materials.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setViewingMaterial(m)}
                          className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left hover:bg-accent/30"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-[12px] font-medium">
                              {m.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {m.fileType}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
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

function ReviewBody({ questions }: { questions: Question[] }) {
  return (
    <ol className="space-y-4">
      {questions.map((q, i) => (
        <li key={q.id} className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className="font-mono">{q.id}</span>
            <span>· {q.type}</span>
            <span>· {q.difficulty}</span>
          </div>
          <div className="mb-3 text-[13.5px] font-semibold">
            <span className="mr-1">Câu {i + 1}:</span>
            <RenderedContent content={q.content} />
          </div>
          <CorrectAnswerHint q={q} />
        </li>
      ))}
    </ol>
  );
}

function CorrectAnswerHint({ q }: { q: Question }) {
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return (
        <ul className="space-y-1 text-[12.5px]">
          {q.options.map((o) => (
            <li
              key={o.id}
              className={cn(
                "rounded-md border px-2 py-1",
                o.isCorrect
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-border bg-card text-foreground/70",
              )}
            >
              {o.isCorrect ? "✓ " : "○ "}
              {o.content}
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
