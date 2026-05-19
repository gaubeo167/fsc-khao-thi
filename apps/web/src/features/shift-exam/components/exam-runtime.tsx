"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  Send,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { cn } from "@/lib/utils";

import {
  useAttemptsStore,
  type Answer,
  type StudentAttempt,
} from "../state/attempts-store";
import { useProctorStore } from "../state/proctor-store";

import { QuestionRenderer } from "./question-renderer";

interface Props {
  shift: ExamShift;
  questions: Question[];
  /**
   * Effective time limit (minutes) for THIS student's attempt — usually
   * `package.duration`, falling back to the blueprint's duration. The
   * runtime computes the wall-clock deadline as
   * `min(attempt.startedAt + durationMin, shift.endAt)`.
   */
  durationMin: number;
}

export function ExamRuntime({ shift, questions, durationMin }: Props) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const startOrResume = useAttemptsStore((s) => s.startOrResume);
  const saveAnswer = useAttemptsStore((s) => s.saveAnswer);
  const toggleMark = useAttemptsStore((s) => s.toggleMark);
  const submit = useAttemptsStore((s) => s.submit);
  const recordViolation = useAttemptsStore((s) => s.recordViolation);
  // Proctor-issued warnings/violations targeted at this student for this
  // shift. We read the *raw* events array (stable reference between
  // unrelated mutations) and filter in `useMemo` — selecting
  // `events.filter(...)` directly would return a brand-new array reference
  // on every render and trigger an infinite re-render loop in Zustand v5.
  const allProctorEvents = useProctorStore((s) => s.events);
  const proctorEvents = useMemo(
    () =>
      allProctorEvents.filter(
        (e) =>
          e.shiftId === shift.id &&
          e.studentId === (session?.userId ?? ""),
      ),
    [allProctorEvents, shift.id, session?.userId],
  );
  const acknowledgeEvent = useProctorStore((s) => s.acknowledge);
  // The most recent unacknowledged message — surfaced as a blocking toast.
  const pendingMsg = proctorEvents.find((e) => e.acknowledgedAt == null);

  // Bootstrap the attempt — runs exactly once per shift/student. Persisted
  // in a ref so React StrictMode double-mounting doesn't create two attempts.
  const attemptRef = useRef<StudentAttempt | null>(null);
  if (!attemptRef.current && session) {
    attemptRef.current = startOrResume({
      shiftId: shift.id,
      studentId: session.userId,
      questionIds: questions.map((q) => q.id),
    });
  }
  // Subscribe so saveAnswer triggers rerender of stats.
  const liveAttempt = useAttemptsStore((s) =>
    s.attempts.find((a) => a.id === attemptRef.current?.id),
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  // Student must click the start overlay so we can a) request fullscreen
  // (which needs a user gesture), and b) show the rules + anti-cheat
  // checklist before the timer starts.
  const [hasStarted, setHasStarted] = useState(false);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  // 1s tick for the timer.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasStarted) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [hasStarted]);

  // Proctor messages now sync via Firestore onSnapshot — no
  // localStorage hook needed. The subscription is started once by
  // AuthBootstrap.

  // Anti-cheat: tab-switch detection.
  useEffect(() => {
    if (!hasStarted) return;
    if (!shift.antiCheat.blockTabSwitch) return;
    const id = attemptRef.current?.id;
    if (!id) return;
    function onVisibility() {
      if (document.hidden) recordViolation(id!, "tabSwitches");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hasStarted, shift.antiCheat.blockTabSwitch, recordViolation]);

  // Anti-cheat: block copy / cut / paste (and ctrl-C, ctrl-X, ctrl-V).
  // We attach to the document so the block is uniform across the whole
  // page (including answer inputs), and we record each blocked event.
  useEffect(() => {
    if (!hasStarted) return;
    if (!shift.antiCheat.blockCopyPaste) return;
    const id = attemptRef.current?.id;
    if (!id) return;
    function onClipboard(e: ClipboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      recordViolation(id!, "pasteAttempts");
    }
    function onContextMenu(e: MouseEvent) {
      // Pair the copy/cut/paste block with right-click block when the
      // shift's `blockRightClick` flag is on. Cheap to add here so we
      // don't duplicate the listener wiring.
      if (shift.antiCheat.blockRightClick) e.preventDefault();
    }
    document.addEventListener("copy", onClipboard, true);
    document.addEventListener("cut", onClipboard, true);
    document.addEventListener("paste", onClipboard, true);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("copy", onClipboard, true);
      document.removeEventListener("cut", onClipboard, true);
      document.removeEventListener("paste", onClipboard, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [
    hasStarted,
    shift.antiCheat.blockCopyPaste,
    shift.antiCheat.blockRightClick,
    recordViolation,
  ]);

  // Anti-cheat: fullscreen enforcement. We request on start (where the
  // user click satisfies the browser's "user gesture" requirement) and
  // watch for exits so we can both record violations and prompt the
  // student to re-enter.
  useEffect(() => {
    if (!hasStarted) return;
    if (!shift.antiCheat.requireFullscreen) return;
    const id = attemptRef.current?.id;
    if (!id) return;
    function onFsChange() {
      if (!document.fullscreenElement) {
        recordViolation(id!, "fullscreenExits");
        setFullscreenLost(true);
      } else {
        setFullscreenLost(false);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFsChange);
  }, [hasStarted, shift.antiCheat.requireFullscreen, recordViolation]);

  // Compute the effective deadline as min(personal limit, shift end).
  // `liveAttempt?.startedAt` is the moment the attempt record was created
  // (= the first time the student opened this page).
  const personalDeadlineMs = liveAttempt
    ? new Date(liveAttempt.startedAt).getTime() + durationMin * 60_000
    : Number.POSITIVE_INFINITY;
  const shiftEndMs = new Date(shift.endAt).getTime();
  const deadlineMs = Math.min(personalDeadlineMs, shiftEndMs);
  const remainingMs = hasStarted ? Math.max(0, deadlineMs - nowMs) : durationMin * 60_000;
  const isOver = hasStarted && remainingMs === 0;
  const submitted = liveAttempt?.submittedAt != null;

  const currentQ = questions[currentIdx];
  const currentAnswer = liveAttempt?.answers[currentQ?.id ?? ""];
  const totalAnswered = liveAttempt
    ? Object.keys(liveAttempt.answers).length
    : 0;
  const markedSet = new Set(liveAttempt?.markedForReview ?? []);

  // Auto-submit when time runs out (only if not already submitted).
  useEffect(() => {
    if (!isOver || submitted) return;
    const att = attemptRef.current;
    if (!att) return;
    const result = submit(att.id, questions);
    if (result) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      router.replace(`/exam/${shift.id}/result`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver, submitted]);

  function go(dir: -1 | 1) {
    setCurrentIdx((i) => Math.max(0, Math.min(questions.length - 1, i + dir)));
  }
  function jumpTo(i: number) {
    setCurrentIdx(Math.max(0, Math.min(questions.length - 1, i)));
  }
  function setAnswer(a: Answer) {
    const att = attemptRef.current;
    if (!att || !currentQ) return;
    saveAnswer(att.id, currentQ.id, a);
  }
  function flagCurrent() {
    const att = attemptRef.current;
    if (!att || !currentQ) return;
    toggleMark(att.id, currentQ.id);
  }
  function handleSubmit() {
    const att = attemptRef.current;
    if (!att) return;
    submit(att.id, questions);
    // Drop fullscreen so the result page renders in normal window mode
    // (the result screen isn't an exam — keeping fullscreen would be
    // disorienting).
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    router.replace(`/exam/${shift.id}/result`);
  }

  // Format timer as HH:MM:SS / MM:SS
  const timer = formatHMS(remainingMs);
  const urgent = remainingMs > 0 && remainingMs < 60_000 * 5;

  if (!currentQ || !liveAttempt) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Đang khởi tạo bài thi…
      </div>
    );
  }

  // Pre-start overlay: shows rules + anti-cheat checklist, requires a
  // click to enter. The click is what lets us request fullscreen.
  if (!hasStarted) {
    return (
      <StartOverlay
        shift={shift}
        durationMin={durationMin}
        questionCount={questions.length}
        onStart={() => {
          if (shift.antiCheat.requireFullscreen) {
            const el = document.documentElement;
            if (el.requestFullscreen) {
              el.requestFullscreen().catch(() => {
                // Browser refused (e.g. browser policy) — proceed
                // anyway; the violation tracker will catch it later
                // if the student exits.
              });
            }
          }
          setHasStarted(true);
        }}
      />
    );
  }

  const violations = liveAttempt.violations;
  const violationTotal =
    violations.tabSwitches + violations.fullscreenExits + violations.pasteAttempts;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      {/* Main panel */}
      <div className="flex min-h-[640px] flex-col rounded-2xl border bg-card">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
            {shift.id}
          </span>
          <h2 className="text-[14px] font-semibold leading-tight">
            {shift.name}
          </h2>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-bold tabular-nums",
                urgent
                  ? "border-rose-300 bg-rose-50 text-rose-800 ring-2 ring-rose-200"
                  : "border-blue-200 bg-blue-50 text-blue-800",
              )}
              title="Thời gian còn lại"
            >
              <Clock className="h-3.5 w-3.5" />
              {timer}
            </div>
            <Button
              size="sm"
              onClick={() => setConfirmingSubmit(true)}
              disabled={submitted}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Nộp bài
            </Button>
          </div>
        </header>

        {/* Anti-cheat banner */}
        {violationTotal > 0 && (
          <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2 text-[12px] text-rose-900">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>
              <span className="font-semibold">Vi phạm anti-cheat:</span>{" "}
              {violations.tabSwitches > 0 &&
                `chuyển tab ×${violations.tabSwitches} `}
              {violations.pasteAttempts > 0 &&
                `paste bị chặn ×${violations.pasteAttempts} `}
              {violations.fullscreenExits > 0 &&
                `thoát fullscreen ×${violations.fullscreenExits}`}
            </span>
          </div>
        )}

        {/* Question */}
        <div className="flex flex-1 flex-col px-6 py-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[12px] font-bold text-primary-text">
              Câu {currentIdx + 1} / {questions.length}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                currentQ.difficulty === "easy"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : currentQ.difficulty === "medium"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-rose-200 bg-rose-50 text-rose-800",
              )}
            >
              {currentQ.difficulty === "easy"
                ? "Dễ"
                : currentQ.difficulty === "medium"
                  ? "TB"
                  : "Khó"}
            </span>
            <button
              type="button"
              onClick={flagCurrent}
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                markedSet.has(currentQ.id)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/30",
              )}
            >
              <Flag className="h-3 w-3" />
              {markedSet.has(currentQ.id) ? "Đã đánh dấu" : "Đánh dấu xem lại"}
            </button>
          </div>

          {/*
            For drag-drop and underline the renderer prints the passage
            inline (with interactive zones / clickable words), so showing
            the raw content here would duplicate it and leak the answer
            markers (`[zone:N]`, `[u:...]`). For fill-blank, strip the
            `[blank:N]` markers since the inputs are rendered separately.
            Other types use the question-bank's RenderedContent so images,
            math, audio, video markers display correctly.
          */}
          {currentQ.type !== "drag-drop" && currentQ.type !== "underline" && (
            <div className="mb-5">
              <RenderedContent
                content={
                  currentQ.type === "fill-blank"
                    ? currentQ.content.replace(/\[blank:\d+\]/g, "_____")
                    : currentQ.content
                }
                className="text-[15px] leading-relaxed text-foreground"
              />
            </div>
          )}

          <QuestionRenderer
            question={currentQ}
            answer={currentAnswer}
            onChange={setAnswer}
            disabled={submitted}
            seed={`${attemptRef.current?.id ?? ""}-${currentQ.id}`}
          />
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-2 border-t bg-[var(--color-surface-2)] px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(-1)}
            disabled={currentIdx === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Câu trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(1)}
            disabled={currentIdx === questions.length - 1}
            className="gap-1.5"
          >
            Câu sau
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-auto text-[12px] text-muted-foreground">
            Đã trả lời:{" "}
            <span className="font-semibold text-foreground">
              {totalAnswered}
            </span>{" "}
            / {questions.length}
          </span>
        </footer>
      </div>

      {/* Sidebar — navigator */}
      <aside className="space-y-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Bản đồ câu hỏi
          </p>
          <ul className="grid grid-cols-5 gap-1.5">
            {questions.map((q, i) => {
              const answered = liveAttempt.answers[q.id] != null;
              const marked = markedSet.has(q.id);
              const active = i === currentIdx;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(i)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-md border text-[12px] font-bold transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : marked
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : answered
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-border bg-card text-foreground/70 hover:bg-accent/30",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ul>
          <ul className="mt-3 space-y-1 text-[10px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded border border-emerald-300 bg-emerald-50" />
              Đã trả lời
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded border border-amber-300 bg-amber-50" />
              Đánh dấu xem lại
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded border border-border bg-card" />
              Chưa làm
            </li>
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-3 text-[12px]">
          <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            <Shield className="h-3 w-3" /> Anti-cheat đang bật
          </div>
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {shift.antiCheat.requireFullscreen && <li>• Yêu cầu fullscreen</li>}
            {shift.antiCheat.blockTabSwitch && <li>• Chặn đổi tab</li>}
            {shift.antiCheat.blockCopyPaste && <li>• Chặn copy/paste</li>}
            {shift.antiCheat.blockRightClick && <li>• Chặn chuột phải</li>}
            {shift.antiCheat.requireWebcam && <li>• Yêu cầu webcam</li>}
            {shift.antiCheat.oneTimeStart && <li>• Chỉ vào thi 1 lần</li>}
          </ul>
        </div>
      </aside>

      {/* Proctor message toast — blocks input until acknowledged. */}
      {pendingMsg && (
        <div
          className="fixed inset-x-0 top-0 z-40 flex justify-center p-3"
          role="alert"
        >
          <div
            className={cn(
              "w-full max-w-xl rounded-xl border-2 px-4 py-3 shadow-lg",
              pendingMsg.kind === "violation"
                ? "border-rose-400 bg-rose-50"
                : pendingMsg.kind === "warning"
                  ? "border-amber-400 bg-amber-50"
                  : "border-blue-400 bg-blue-50",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg",
                  pendingMsg.kind === "violation"
                    ? "bg-rose-200 text-rose-800"
                    : pendingMsg.kind === "warning"
                      ? "bg-amber-200 text-amber-800"
                      : "bg-blue-200 text-blue-800",
                )}
              >
                {pendingMsg.kind === "violation"
                  ? "🚨"
                  : pendingMsg.kind === "warning"
                    ? "⚠"
                    : "ℹ️"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[12px] font-bold uppercase tracking-[0.06em]",
                    pendingMsg.kind === "violation"
                      ? "text-rose-800"
                      : pendingMsg.kind === "warning"
                        ? "text-amber-800"
                        : "text-blue-800",
                  )}
                >
                  Tin nhắn từ giám thị {pendingMsg.proctorName}
                  {pendingMsg.tag && (
                    <span className="ml-1 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] normal-case">
                      {pendingMsg.tag}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[14px] leading-snug">
                  {pendingMsg.body}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => acknowledgeEvent(pendingMsg.id)}
              >
                Đã đọc
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen-lost overlay — non-dismissable until they re-enter. */}
      {fullscreenLost && shift.antiCheat.requireFullscreen && !submitted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-xl bg-card p-6 text-center shadow-xl">
            <ShieldAlert className="mx-auto h-9 w-9 text-rose-600" />
            <h3 className="mt-3 text-[18px] font-bold">
              Bạn đã thoát fullscreen
            </h3>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Cấu hình anti-cheat của ca thi yêu cầu chế độ toàn màn hình.
              Vi phạm đã được ghi lại. Click để quay lại fullscreen và tiếp
              tục làm bài.
            </p>
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => {
                const el = document.documentElement;
                if (el.requestFullscreen) {
                  el.requestFullscreen().catch(() => setFullscreenLost(false));
                } else {
                  setFullscreenLost(false);
                }
              }}
            >
              Vào lại fullscreen
            </Button>
          </div>
        </div>
      )}

      {/* Submit confirmation — two-step for safety:
            step 1 = checklist of warnings (unanswered, marked, essay)
            step 2 = final "Are you really sure?" confirmation
          so an accidental double-click doesn't submit a half-done exam. */}
      {confirmingSubmit && !submitted && (
        <SubmitConfirm
          totalAnswered={totalAnswered}
          totalQuestions={questions.length}
          unansweredQuestionNumbers={questions
            .map((q, i) => (liveAttempt.answers[q.id] ? null : i + 1))
            .filter((n): n is number => n != null)}
          markedCount={markedSet.size}
          essayCount={
            questions.filter(
              (q) => q.type === "essay" || q.type === "ai-generated",
            ).length
          }
          onCancel={() => setConfirmingSubmit(false)}
          onConfirm={handleSubmit}
        />
      )}
    </div>
  );
}

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function SubmitConfirm({
  totalAnswered,
  totalQuestions,
  unansweredQuestionNumbers,
  markedCount,
  essayCount,
  onCancel,
  onConfirm,
}: {
  totalAnswered: number;
  totalQuestions: number;
  unansweredQuestionNumbers: number[];
  markedCount: number;
  essayCount: number;
  onCancel(): void;
  onConfirm(): void;
}) {
  // Two-step confirm. Step 1 shows the warnings, step 2 forces a second
  // explicit "Tôi chắc chắn nộp" press so a stray double-click can't yank
  // the student out mid-thought.
  const [step, setStep] = useState<"review" | "final">("review");
  const unansweredCount = totalQuestions - totalAnswered;
  const hasUnanswered = unansweredCount > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        {step === "review" ? (
          <>
            <h3 className="flex items-center gap-2 text-[16px] font-semibold">
              <Send className="h-4 w-4 text-blue-600" /> Trước khi nộp bài
            </h3>
            <div className="mt-3 space-y-2">
              <p className="text-[13px]">
                Bạn đã trả lời{" "}
                <span className="font-semibold">
                  {totalAnswered}/{totalQuestions}
                </span>{" "}
                câu.
              </p>
              {hasUnanswered && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                  <p className="font-semibold">
                    ⚠ Còn {unansweredCount} câu chưa trả lời:
                  </p>
                  <p className="mt-0.5 text-rose-800">
                    Câu{" "}
                    {unansweredQuestionNumbers.slice(0, 30).join(", ")}
                    {unansweredQuestionNumbers.length > 30 && "…"}
                  </p>
                  <p className="mt-1 text-rose-700">
                    Các câu này sẽ được tính <b>0 điểm</b>. Bạn có muốn quay lại
                    làm thêm?
                  </p>
                </div>
              )}
              {markedCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <p>
                    🚩 Bạn còn <b>{markedCount} câu đánh dấu xem lại</b>. Kiểm tra
                    lại các câu này trước khi nộp?
                  </p>
                </div>
              )}
              {essayCount > 0 && (
                <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-900">
                  <p>
                    📝 Có <b>{essayCount} câu tự luận / AI</b>. Những câu này
                    sẽ được giáo viên / AI <b>chấm và cập nhật điểm sau</b>.
                    Điểm hiện tại chỉ tính phần trắc nghiệm tự động.
                  </p>
                </div>
              )}
              <div className="rounded-md border border-foreground/15 bg-muted/30 px-3 py-2 text-[12px] text-foreground/80">
                ⚠ Sau khi nộp, bạn <b>không thể thay đổi</b> câu trả lời nào.
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Quay lại làm bài
              </Button>
              <Button
                size="sm"
                onClick={() => setStep("final")}
                className="gap-1.5"
                variant={hasUnanswered ? "destructive" : "default"}
              >
                {hasUnanswered ? "Nộp dù còn thiếu" : "Tiếp tục nộp bài"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="flex items-center gap-2 text-[16px] font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Xác nhận lần cuối
            </h3>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Bạn có chắc chắn nộp bài? Hành động này không thể hoàn tác.
            </p>
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
              ✓ Đã trả lời {totalAnswered}/{totalQuestions} câu.
              {essayCount > 0 && (
                <> Trong đó {essayCount} câu chờ chấm thủ công.</>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("review")}
              >
                Xem lại
              </Button>
              <Button size="sm" onClick={onConfirm} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tôi chắc chắn nộp
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StartOverlay({
  shift,
  durationMin,
  questionCount,
  onStart,
}: {
  shift: ExamShift;
  durationMin: number;
  questionCount: number;
  onStart(): void;
}) {
  const flags: Array<{ on: boolean; label: string }> = [
    { on: shift.antiCheat.requireFullscreen, label: "Bắt buộc toàn màn hình" },
    { on: shift.antiCheat.blockTabSwitch, label: "Chặn chuyển tab" },
    { on: shift.antiCheat.blockCopyPaste, label: "Chặn copy / paste" },
    { on: shift.antiCheat.blockRightClick, label: "Chặn chuột phải" },
    { on: shift.antiCheat.requireWebcam, label: "Yêu cầu webcam" },
    { on: shift.antiCheat.randomizeQuestions, label: "Đảo thứ tự câu" },
    { on: shift.antiCheat.randomizeOptions, label: "Đảo thứ tự đáp án" },
    { on: shift.antiCheat.oneTimeStart, label: "Chỉ vào thi 1 lần" },
  ].filter((f) => f.on);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-7 shadow-sm">
      <header className="text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="mt-3 text-[22px] font-bold leading-tight">
          {shift.name}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Sẵn sàng làm bài thi? Đọc nội dung phía dưới trước khi bắt đầu.
        </p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Thời gian
          </div>
          <div className="mt-0.5 text-[20px] font-bold leading-none text-blue-700">
            {durationMin}p
          </div>
        </div>
        <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Số câu
          </div>
          <div className="mt-0.5 text-[20px] font-bold leading-none text-emerald-700">
            {questionCount}
          </div>
        </div>
        <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Hạn nộp
          </div>
          <div className="mt-0.5 text-[13px] font-bold leading-tight text-amber-700">
            {new Date(shift.endAt).toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
            })}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border bg-amber-50/40 p-4">
        <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-900">
          <Shield className="h-3.5 w-3.5" /> Quy định ca thi
        </h3>
        <ul className="mt-2 space-y-1 text-[12px] text-amber-900/90">
          <li>
            ⏰ Bộ đề có{" "}
            <span className="font-semibold">{durationMin} phút</span> kể từ khi
            bạn nhấn "Bắt đầu". Đồng hồ đếm ngược sẽ hiện ở góc phải.
          </li>
          <li>
            📤 Khi hết giờ, hệ thống <span className="font-semibold">tự nộp bài</span>{" "}
            câu hiện tại. Bạn nên chủ động nộp khi đã làm xong.
          </li>
          <li>
            🔁 Chỉ làm <span className="font-semibold">1 lần</span> — không
            quay lại được sau khi nộp.
          </li>
          {flags.length > 0 && (
            <li>
              🛡 Anti-cheat đang bật:{" "}
              <span className="font-semibold">
                {flags.map((f) => f.label).join(" · ")}
              </span>
            </li>
          )}
        </ul>
      </section>

      <div className="mt-6 flex justify-center">
        <Button size="lg" onClick={onStart} className="gap-2 px-8">
          <Clock className="h-4 w-4" />
          Bắt đầu làm bài
        </Button>
      </div>
      {shift.antiCheat.requireFullscreen && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Nhấn "Bắt đầu" sẽ tự động vào chế độ toàn màn hình.
        </p>
      )}
    </div>
  );
}
