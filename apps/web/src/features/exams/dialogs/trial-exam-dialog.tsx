"use client";

import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Send,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { useGradesStore } from "@/features/grades/state/grades-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import type { GeneratedExam } from "../data/types";
import { gradeExam, type ExamGrade, type Verdict } from "../lib/grade";

interface Props {
  exam: GeneratedExam | null;
  onClose(): void;
  /** Optional — wires the "Xoá đề này" button in the header. */
  onDelete?(exam: GeneratedExam): void;
}

/**
 * Student-facing trial run of a generated exam. Built to let staff verify
 * an exam works end-to-end before publishing — answers are local-only and
 * thrown away on close.
 *
 * Layout matches the student-side mock: blue top bar with timer +
 * sidebar nav (numbered grid + legend) + main panel showing one question at
 * a time.
 */
export function TrialExamDialog({ exam, onClose, onDelete }: Props) {
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);

  // Resolve actual question objects from the exam's id list. Filter out any
  // missing questions (in case a question was deleted from the bank after the
  // exam was generated — the bank can mutate independently).
  const questions = useMemo(() => {
    if (!exam) return [];
    return exam.questionIds
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q): q is Question => Boolean(q));
  }, [exam, allQuestions]);

  // Flow: "intro" (show summary + Bắt đầu) → "doing" (timer running) →
  // "done" (results panel + Làm lại). Re-opening the dialog returns to
  // intro so the student can review what's in the exam before
  // committing to a timed attempt.
  const [stage, setStage] = useState<"intro" | "doing" | "done">("intro");
  const [cursor, setCursor] = useState(0);
  /** answers[questionId] = "raw" answer marker (depends on question type). */
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  // Lazy-init the timer to the exam's duration so the countdown effect
  // never sees a transient `secondsLeft === 0` on the very first render.
  // The old `useState(0)` caused the dialog to auto-submit immediately on
  // first open (showing the grade panel) — the student had to close + re-
  // open to actually take the trial. With lazy init the timer is correct
  // from render #1.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    exam ? exam.duration * 60 : 0,
  );
  const [submitted, setSubmitted] = useState(false);
  /** True only when submission was triggered by the timer hitting zero. */
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  // Reset state every time a new exam is opened. Still useful when the
  // parent keeps this component mounted across exams (changes `exam` prop).
  useEffect(() => {
    if (!exam) return;
    setStage("intro");
    setCursor(0);
    setAnswers({});
    setSecondsLeft(exam.duration * 60);
    setSubmitted(false);
    setAutoSubmitted(false);
  }, [exam]);

  function startAttempt() {
    if (!exam) return;
    setStage("doing");
    setCursor(0);
    setAnswers({});
    setSecondsLeft(exam.duration * 60);
    setSubmitted(false);
    setAutoSubmitted(false);
  }

  // Countdown — pauses outside the "doing" stage so the intro and
  // result screens don't bleed time. Auto-submit when it hits zero.
  useEffect(() => {
    if (!exam || submitted || stage !== "doing") return;
    if (secondsLeft === 0) {
      setSubmitted(true);
      setAutoSubmitted(true);
      setStage("done");
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [exam, secondsLeft, submitted, stage]);

  // Grade only at submit time so the heavy comparison doesn't run every render.
  const grade: ExamGrade | null = useMemo(() => {
    if (!submitted) return null;
    return gradeExam(questions, answers);
  }, [submitted, questions, answers]);

  if (!exam) return null;

  const current = questions[cursor];
  const subject = current ? subjects.find((s) => s.id === current.subjectId) : null;
  const gradeMeta = current ? grades.find((g) => g.id === current.gradeId) : null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timerStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const timerCritical = secondsLeft <= 60 && !submitted;

  function setAnswer(value: unknown) {
    if (!current || submitted) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  const answeredCount = Object.keys(answers).filter((k) =>
    questions.some((q) => q.id === k),
  ).length;
  const allAnswered =
    questions.length > 0 && answeredCount === questions.length;

  function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);
    setAutoSubmitted(false);
    setStage("done");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-5xl p-0 max-h-[96vh] overflow-hidden flex flex-col"
        srTitle={`Thi thử ${exam.name}`}
      >
        {/* Top blue bar */}
        <header className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-primary to-[#1D4ED8] px-5 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
              <Target className="h-4.5 w-4.5" strokeWidth={2} />
            </span>
            <div className="leading-tight">
              <DialogTitle className="text-[15px] font-semibold text-white">
                Thi thử — Giao diện học sinh
              </DialogTitle>
              <p className="text-[11px] text-white/80">
                Trải nghiệm như học sinh làm bài
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Timer only visible during the active attempt. Intro and
                results screens show a neutral pill so the student
                isn't pressured before starting / after finishing. */}
            {stage === "doing" ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[14px] font-bold tabular-nums ring-1",
                  timerCritical
                    ? "bg-rose-500/20 text-rose-100 ring-rose-300/50 animate-pulse"
                    : "bg-white/15 text-white ring-white/25",
                )}
              >
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                {timerStr}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/25">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                {exam.duration} phút
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(exam);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/25"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.85} />
                Xoá đề này
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        {stage === "intro" ? (
          <IntroPanel
            exam={exam}
            questions={questions}
            subjects={subjects}
            grades={grades}
            onStart={startAttempt}
          />
        ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
          {/* Left sidebar */}
          <aside className="overflow-y-auto border-r bg-surface-2/30 px-4 py-4">
            <p className="text-[13px] font-semibold leading-snug text-foreground/85">
              📝 {exam.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {questions.length} câu · {exam.duration} phút
            </p>

            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => {
                const isCurrent = i === cursor;
                const isAnswered = answers[q.id] !== undefined;
                const v = grade
                  ? grade.results.find((r) => r.questionId === q.id)?.grade.verdict
                  : null;
                let style =
                  "border-border bg-card text-foreground/70 hover:bg-accent";
                if (isCurrent) {
                  style = "border-primary bg-primary text-white";
                } else if (v === "correct") {
                  style =
                    "border-emerald-400 bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
                } else if (v === "partial") {
                  style =
                    "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200";
                } else if (v === "wrong") {
                  style =
                    "border-rose-400 bg-rose-100 text-rose-800 hover:bg-rose-200";
                } else if (v === "manual") {
                  style =
                    "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100";
                } else if (v === "skipped") {
                  style =
                    "border-foreground/30 bg-muted text-foreground/70 hover:bg-muted/80";
                } else if (isAnswered) {
                  style =
                    "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
                }
                return (
                  // Position-prefixed key — `q.id` alone is not guaranteed
                  // unique because the same question can legitimately appear
                  // multiple times in a single generated paper (e.g. legacy
                  // blueprints created before the cross-mạch dedup landed).
                  <button
                    key={`${i}-${q.id}`}
                    type="button"
                    onClick={() => setCursor(i)}
                    className={cn(
                      "h-8 rounded-md border text-[12px] font-semibold tabular-nums transition-colors",
                      style,
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <ul className="mt-4 space-y-1.5 text-[11px] text-foreground/70">
              {submitted ? (
                <>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-emerald-400 bg-emerald-100" />
                    Đúng
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-amber-400 bg-amber-100" />
                    Đúng một phần
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-rose-400 bg-rose-100" />
                    Sai
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-violet-300 bg-violet-50" />
                    Cần chấm tay
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-foreground/30 bg-muted" />
                    Chưa làm
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-50" />
                    Đã làm
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-primary bg-primary" />
                    Đang xem
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm border border-border bg-card" />
                    Chưa làm
                  </li>
                </>
              )}
            </ul>

            <p className="mt-4 rounded-md bg-primary-soft px-2 py-1.5 text-[11px] text-primary-text">
              Đã làm{" "}
              <span className="font-bold">{answeredCount}</span> /{" "}
              {questions.length} câu
            </p>
          </aside>

          {/* Main area — flex column so nav always anchors to the bottom and
              the question/answer area doesn't shrink-to-fit short questions. */}
          <main className="flex min-h-0 flex-col overflow-y-auto px-6 py-5">
            {!current ? (
              <p className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
                Đề thi không có câu hỏi hợp lệ.
              </p>
            ) : submitted && grade ? (
              <ResultsView
                exam={exam}
                questions={questions}
                grade={grade}
                autoSubmitted={autoSubmitted}
                onClose={onClose}
                onRetry={() => setStage("intro")}
              />
            ) : (
              <>
                {/* Question header */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-foreground/85">
                      Câu {cursor + 1}/{questions.length}
                    </span>
                    <DifficultyBadge difficulty={current.difficulty} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {current.id}
                    </span>
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {subject?.name ?? "—"} · {gradeMeta?.code ?? "—"}
                  </span>
                </div>

                {/* Question + answer area is held in a flex-1 wrapper so the
                    nav row below stays pinned to the bottom and the area
                    doesn't visually shrink when the question is short. */}
                <div className="flex flex-1 flex-col gap-4 min-h-[420px]">
                  <div className="rounded-xl border bg-card p-4 text-[14px]">
                    <RenderedContent content={current.content} />
                  </div>
                  <div>
                    <AnswerArea
                      question={current}
                      value={answers[current.id]}
                      onChange={setAnswer}
                    />
                  </div>
                </div>

                {/* Nav — always pinned to bottom of the main column. */}
                <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    disabled={cursor === 0}
                    onClick={() => setCursor((c) => Math.max(0, c - 1))}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Câu trước
                  </Button>
                  <div className="flex items-center gap-2">
                    {cursor < questions.length - 1 && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setCursor((c) => Math.min(questions.length - 1, c + 1))
                        }
                      >
                        Câu sau
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      onClick={handleSubmit}
                      className={cn(
                        allAnswered &&
                          "bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                      title={
                        allAnswered
                          ? "Nộp bài & xem kết quả"
                          : `Còn ${questions.length - answeredCount} câu chưa làm — vẫn nộp được`
                      }
                    >
                      <Send className="h-4 w-4" />
                      Nộp bài
                      {!allAnswered && (
                        <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[11px]">
                          {answeredCount}/{questions.length}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntroPanel({
  exam,
  questions,
  subjects,
  grades,
  onStart,
}: {
  exam: GeneratedExam;
  questions: Question[];
  subjects: Array<{ id: string; name: string; color?: string }>;
  grades: Array<{ id: string; name: string }>;
  onStart: () => void;
}) {
  // Type/difficulty histogram for the summary table.
  const byType = new Map<string, number>();
  const byDifficulty = new Map<string, number>();
  const subjectIds = new Set<string>();
  const gradeIds = new Set<string>();
  for (const q of questions) {
    byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
    byDifficulty.set(q.difficulty, (byDifficulty.get(q.difficulty) ?? 0) + 1);
    if (q.subjectId) subjectIds.add(q.subjectId);
    if (q.gradeId) gradeIds.add(q.gradeId);
  }
  const TYPE_LABEL: Record<string, string> = {
    "mcq-single": "Trắc nghiệm 1 đáp án",
    "mcq-multi": "Trắc nghiệm nhiều đáp án",
    "true-false": "Đúng / Sai",
    "multi-tf": "Đ/S nhiều câu phụ",
    "short-answer": "Trả lời ngắn",
    "fill-blank": "Điền chỗ trống",
    matching: "Ghép cặp",
    ordering: "Sắp xếp",
    "drag-drop": "Kéo thả",
    underline: "Gạch chân",
    essay: "Tự luận",
    "ai-generated": "AI sinh",
  };
  const DIFF_LABEL: Record<string, string> = {
    easy: "Dễ",
    medium: "Trung bình",
    hard: "Khó",
  };
  const subjectNames = Array.from(subjectIds)
    .map((id) => subjects.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const gradeNames = Array.from(gradeIds)
    .map((id) => grades.find((g) => g.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-[18px] font-bold text-foreground/90">
            📝 {exam.name}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Trước khi bắt đầu, xem qua thông tin bộ đề. Bấm "Bắt đầu làm thử"
            để bộ đếm thời gian khởi chạy.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Số câu" value={String(questions.length)} />
            <SummaryTile label="Thời gian" value={`${exam.duration} phút`} />
            <SummaryTile label="Môn" value={subjectNames || "—"} />
            <SummaryTile label="Khối" value={gradeNames || "—"} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-foreground/60">
                Dạng câu hỏi
              </p>
              <ul className="mt-2 space-y-1">
                {[...byType.entries()].map(([type, count]) => (
                  <li
                    key={type}
                    className="flex items-center justify-between rounded-md bg-surface-2/40 px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span>{TYPE_LABEL[type] ?? type}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-foreground/60">
                Mức độ
              </p>
              <ul className="mt-2 space-y-1">
                {[...byDifficulty.entries()].map(([diff, count]) => (
                  <li
                    key={diff}
                    className="flex items-center justify-between rounded-md bg-surface-2/40 px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span>{DIFF_LABEL[diff] ?? diff}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <Button size="lg" onClick={onStart}>
              <Target className="h-4 w-4" />
              Bắt đầu làm thử
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-foreground/55">
        {label}
      </p>
      <p className="mt-0.5 text-[13.5px] font-semibold leading-tight">
        {value}
      </p>
    </div>
  );
}

/* ───────── Answer area (read-only-friendly, supports MCQ / TF / fill-blank) ───────── */

function AnswerArea({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange(v: unknown): void;
}) {
  switch (question.type) {
    case "mcq-single": {
      const selected = typeof value === "string" ? value : null;
      return (
        <ul className="space-y-2.5">
          {question.options.map((opt, i) => {
            const checked = selected === opt.id;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => onChange(opt.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                      checked
                        ? "bg-primary text-white"
                        : "bg-muted text-foreground/70",
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-[13px]">
                    <RenderedContent inline content={opt.content} />
                  </span>
                  <span
                    className={cn(
                      "h-5 w-5 shrink-0 rounded-full border-2",
                      checked
                        ? "border-primary bg-primary ring-2 ring-primary/30"
                        : "border-foreground/30",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      );
    }
    case "mcq-multi": {
      const set = value instanceof Set ? value : new Set<string>();
      return (
        <ul className="space-y-2.5">
          {question.options.map((opt, i) => {
            const checked = set.has(opt.id);
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(set);
                    if (next.has(opt.id)) next.delete(opt.id);
                    else next.add(opt.id);
                    onChange(next);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                      checked
                        ? "bg-primary text-white"
                        : "bg-muted text-foreground/70",
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-[13px]">
                    <RenderedContent inline content={opt.content} />
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                      checked
                        ? "border-primary bg-primary text-white"
                        : "border-foreground/30",
                    )}
                  >
                    {checked && "✓"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      );
    }
    case "true-false": {
      return (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => {
            const checked = value === v;
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => onChange(v)}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-[14px] font-semibold transition-colors",
                  checked
                    ? v
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-border bg-card text-foreground/70 hover:bg-accent",
                )}
              >
                {v ? "Đúng" : "Sai"}
              </button>
            );
          })}
        </div>
      );
    }
    case "fill-blank": {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {question.blanks.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-soft px-2 text-[11px] font-bold text-primary-text">
                #{i + 1}
              </span>
              <input
                type="text"
                value={arr[i] ?? ""}
                onChange={(e) => {
                  const next = [...arr];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                placeholder={`Đáp án ô ${i + 1}…`}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-[14px] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
          ))}
        </div>
      );
    }
    case "essay":
    case "short-answer": {
      const txt = typeof value === "string" ? value : "";
      return (
        <textarea
          rows={6}
          value={txt}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập câu trả lời…"
          className="block w-full rounded-md border bg-background px-3 py-2 text-[14px] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      );
    }
    case "multi-tf": {
      const map = (value && typeof value === "object" ? value : {}) as Record<
        string,
        boolean
      >;
      return (
        <div className="space-y-2">
          {question.subQuestions.map((sub, i) => {
            const v = map[sub.id];
            return (
              <div
                key={sub.id}
                className="rounded-lg border bg-card px-3 py-2"
              >
                <p className="text-[13px] text-foreground/85">
                  <span className="mr-1 font-semibold">{i + 1}.</span>
                  <RenderedContent inline content={sub.statement} />
                </p>
                <div className="mt-2 flex gap-2">
                  {[true, false].map((b) => (
                    <button
                      key={String(b)}
                      type="button"
                      onClick={() => onChange({ ...map, [sub.id]: b })}
                      className={cn(
                        "rounded-md border px-3 py-1 text-[12px] font-semibold transition-colors",
                        v === b
                          ? b
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-rose-400 bg-rose-50 text-rose-700"
                          : "border-border bg-card text-foreground/70 hover:bg-accent",
                      )}
                    >
                      {b ? "Đúng" : "Sai"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case "matching": {
      const map = (value && typeof value === "object" ? value : {}) as Record<
        string,
        string
      >;
      const allRights = [
        ...question.pairs.map((p) => ({ id: p.id, right: p.right })),
        ...((question.distractors ?? []).map((d) => ({
          id: d.id,
          right: d.right,
        }))),
      ];
      return (
        <ul className="space-y-2">
          {question.pairs.map((p, i) => (
            <li
              key={p.id}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border bg-card p-2.5"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <RenderedContent inline content={p.left} />
              <span className="text-muted-foreground">→</span>
              <select
                value={map[p.id] ?? ""}
                onChange={(e) =>
                  onChange({ ...map, [p.id]: e.target.value })
                }
                className="rounded-md border bg-background px-2 py-1.5 text-[13px]"
              >
                <option value="">— chọn —</option>
                {allRights.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.right}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      );
    }
    case "ordering": {
      const ids = Array.isArray(value)
        ? (value as string[])
        : question.items.map((it) => it.id);
      function move(idx: number, dir: -1 | 1) {
        const next = [...ids];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap]!, next[idx]!];
        onChange(next);
      }
      return (
        <ol className="space-y-2">
          {ids.map((id, idx) => {
            const item = question.items.find((it) => it.id === id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border bg-card p-2.5"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-white">
                  {idx + 1}
                </span>
                <span className="flex-1 text-[13px]">{item?.content}</span>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="rounded-md border px-2 py-1 text-[12px] disabled:opacity-40"
                  title="Lên"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === ids.length - 1}
                  className="rounded-md border px-2 py-1 text-[12px] disabled:opacity-40"
                  title="Xuống"
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
      );
    }
    case "drag-drop": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const options = [
        ...question.zones.map((z) => z.correctContent),
        ...(question.distractors ?? []).map((d) => d.content),
      ];
      return (
        <div className="space-y-2">
          {question.zones.map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border bg-card p-2.5"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <select
                value={arr[i] ?? ""}
                onChange={(e) => {
                  const next = [...arr];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-[13px]"
              >
                <option value="">— chọn cụm từ —</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case "underline": {
      const selected = Array.isArray(value)
        ? new Set(value as string[])
        : new Set<string>();
      // Walk content + markers in lockstep so each word knows whether
      // it sits inside a `[u:...]` (the answer) — only those are
      // clickable / counted. Other "10"s in the prompt won't trigger.
      const slices: Array<{ text: string; isMarker: boolean }> = [];
      const reMark = /\[u:([^\]\n]+)\]/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = reMark.exec(question.content)) !== null) {
        if (m.index > lastIdx)
          slices.push({
            text: question.content.slice(lastIdx, m.index),
            isMarker: false,
          });
        slices.push({ text: m[1]!, isMarker: true });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < question.content.length)
        slices.push({
          text: question.content.slice(lastIdx),
          isMarker: false,
        });

      const tokens: Array<{
        kind: "word" | "sep";
        value: string;
        correct: boolean;
      }> = [];
      const tokRe = /([\p{L}\p{N}]+(?:['']\p{L}+)?)|([^\p{L}\p{N}]+)/gu;
      for (const slice of slices) {
        tokRe.lastIndex = 0;
        let tm: RegExpExecArray | null;
        while ((tm = tokRe.exec(slice.text)) !== null) {
          if (tm[1] !== undefined)
            tokens.push({
              kind: "word",
              value: tm[1],
              correct: slice.isMarker,
            });
          else if (tm[2] !== undefined)
            tokens.push({
              kind: "sep",
              value: tm[2]!,
              correct: false,
            });
        }
      }

      function toggle(word: string) {
        const next = new Set(selected);
        if (next.has(word)) next.delete(word);
        else next.add(word);
        onChange(Array.from(next));
      }

      return (
        <div className="rounded-lg border bg-surface p-4 text-[14px] leading-loose">
          {tokens.map((t, i) =>
            t.kind === "sep" ? (
              <span key={i}>{t.value}</span>
            ) : (
              <span
                key={i}
                onClick={() => toggle(t.value)}
                className={cn(
                  "cursor-pointer rounded px-0.5 transition-colors",
                  selected.has(t.value)
                    ? "bg-primary/15 text-primary underline decoration-2 underline-offset-2"
                    : "hover:bg-muted",
                )}
              >
                {t.value}
              </span>
            ),
          )}
        </div>
      );
    }
    default:
      return (
        <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-[12px] text-muted-foreground">
          Dạng câu hỏi này chỉ xem trước được trong giao diện thi thử.
        </p>
      );
  }
}

function DifficultyBadge({ difficulty }: { difficulty: Question["difficulty"] }) {
  const cfg =
    difficulty === "easy"
      ? { label: "NHẬN BIẾT", className: "bg-emerald-100 text-emerald-700" }
      : difficulty === "medium"
        ? { label: "THÔNG HIỂU", className: "bg-amber-100 text-amber-700" }
        : { label: "VẬN DỤNG CAO", className: "bg-rose-100 text-rose-700" };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

/* ───────── Results view (after submit) ───────── */

function ResultsView({
  exam: _exam,
  questions,
  grade,
  autoSubmitted,
  onClose,
  onRetry,
}: {
  exam: GeneratedExam;
  questions: Question[];
  grade: ExamGrade;
  autoSubmitted: boolean;
  onClose(): void;
  onRetry(): void;
}) {
  const denom = grade.autoGradableCount;
  const percent = denom === 0 ? 0 : Math.round((grade.totalScore / denom) * 100);
  // Combine wrong + partial → "Sai" so the breakdown matches the simple
  // 4-card layout the design calls for.
  const wrongTotal = grade.wrongCount + grade.partialCount;
  const skippedTotal = grade.skippedCount + grade.manualCount;
  const tier: ResultTier = autoSubmitted
    ? "timeup"
    : percent >= 80
      ? "excellent"
      : percent >= 50
        ? "good"
        : "tryagain";
  const tierMeta = TIER_META[tier];
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Hero — emoji + tier message */}
      <div className="flex flex-col items-center pt-3 text-center">
        <span className="text-[48px] leading-none" aria-hidden>
          {tierMeta.emoji}
        </span>
        <p className="mt-2 text-[22px] font-bold tracking-tight text-foreground">
          {tierMeta.title}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Bạn đã hoàn thành đề thi
        </p>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="emerald" value={grade.correctCount} label="Đúng" />
        <StatCard tone="rose" value={wrongTotal} label="Sai" />
        <StatCard tone="slate" value={skippedTotal} label="Chưa làm / Tự luận" />
        <StatCard
          tone="primary"
          value={`${percent}%`}
          label="Tỷ lệ đúng"
        />
      </div>

      {/* Per-question breakdown — slim pill rows, expand on click */}
      <section className="rounded-2xl border bg-card p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-foreground/90">
          <span aria-hidden>📋</span> Chi tiết từng câu
        </p>
        <ul className="space-y-1.5">
          {questions.map((q, i) => {
            const r = grade.results.find((rr) => rr.questionId === q.id);
            if (!r) return null;
            const v = r.grade.verdict;
            const isOpen = expanded.has(q.id);
            return (
              <li key={`${i}-${q.id}`}>
                <button
                  type="button"
                  onClick={() => toggleExpand(q.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-full border px-3 py-1.5 text-left transition-colors",
                    pillToneClasses(v),
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      pillBadgeClasses(v),
                    )}
                  >
                    {verdictIcon(v)}
                    Câu {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    <RenderedContent inline content={q.content} />
                  </span>
                  <span className="shrink-0 text-[11px] text-foreground/55">
                    {isOpen ? "Thu gọn" : "Xem"}
                  </span>
                </button>

                {isOpen && (
                  <div
                    className={cn(
                      "mt-1 rounded-xl border bg-card p-3 text-[12.5px]",
                      verdictDetailBorderClass(v),
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-mono text-muted-foreground">
                        {q.id}
                      </span>
                      <DifficultyBadge difficulty={q.difficulty} />
                      <span className="ml-auto text-muted-foreground">
                        {r.grade.score.toFixed(2)} điểm
                      </span>
                    </div>
                    <dl className="space-y-1.5">
                      <DetailRow label="Đáp án bạn chọn">
                        <span
                          className={cn(
                            v === "correct"
                              ? "text-emerald-700"
                              : v === "wrong"
                                ? "text-rose-700"
                                : "text-foreground/85",
                          )}
                        >
                          {r.grade.studentText}
                        </span>
                      </DetailRow>
                      <DetailRow label="Đáp án đúng">
                        <span className="font-semibold text-emerald-700">
                          {r.grade.correctText}
                        </span>
                      </DetailRow>
                      {q.explanation && (
                        <DetailRow label="Giải thích">
                          <span className="italic text-muted-foreground">
                            {q.explanation}
                          </span>
                        </DetailRow>
                      )}
                    </dl>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onRetry}>
          🔁 Làm thử lại
        </Button>
        <Button onClick={onClose}>Đóng kết quả</Button>
      </div>
    </div>
  );
}

type ResultTier = "excellent" | "good" | "tryagain" | "timeup";

const TIER_META: Record<ResultTier, { emoji: string; title: string }> = {
  excellent: { emoji: "🏆", title: "Tuyệt vời!" },
  good: { emoji: "👏", title: "Khá tốt!" },
  tryagain: { emoji: "💪", title: "Cần cố gắng thêm!" },
  timeup: { emoji: "⏰", title: "Hết giờ rồi!" },
};

function StatCard({
  tone,
  value,
  label,
}: {
  tone: "emerald" | "rose" | "slate" | "primary";
  value: number | string;
  label: string;
}) {
  const palette = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    primary: "border-primary/40 bg-primary/8 text-primary",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border-2 px-4 py-3 text-center",
        palette,
      )}
    >
      <p className="text-[26px] font-extrabold leading-tight tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] opacity-85">
        {label}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <dt className="shrink-0 font-semibold text-foreground/70">{label}:</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function pillToneClasses(v: Verdict): string {
  switch (v) {
    case "correct":
      return "border-emerald-200 bg-emerald-50 hover:bg-emerald-100";
    case "wrong":
      return "border-rose-200 bg-rose-50 hover:bg-rose-100";
    case "partial":
      return "border-amber-200 bg-amber-50 hover:bg-amber-100";
    case "manual":
      return "border-violet-200 bg-violet-50 hover:bg-violet-100";
    case "skipped":
      return "border-slate-200 bg-slate-50 hover:bg-slate-100";
  }
}

function pillBadgeClasses(v: Verdict): string {
  switch (v) {
    case "correct":
      return "bg-emerald-500 text-white";
    case "wrong":
      return "bg-rose-500 text-white";
    case "partial":
      return "bg-amber-500 text-white";
    case "manual":
      return "bg-violet-500 text-white";
    case "skipped":
      return "bg-slate-400 text-white";
  }
}

function verdictIcon(v: Verdict): string {
  switch (v) {
    case "correct":
      return "✓";
    case "wrong":
      return "✗";
    case "partial":
      return "◐";
    case "manual":
      return "✎";
    case "skipped":
      return "○";
  }
}

function verdictDetailBorderClass(v: Verdict): string {
  switch (v) {
    case "correct":
      return "border-emerald-200";
    case "wrong":
      return "border-rose-200";
    case "partial":
      return "border-amber-200";
    case "manual":
      return "border-violet-200";
    case "skipped":
      return "border-slate-200";
  }
}
