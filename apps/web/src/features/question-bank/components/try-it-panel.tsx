"use client";

import {
  ArrowRight,
  Check,
  Eye,
  GripVertical,
  PartyPopper,
  PlayCircle,
  RotateCcw,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { QuestionType } from "../data/question-types";
import { RenderedContent } from "./rendered-content";

interface Props {
  values: any;
  type: QuestionType;
  onExit: () => void;
  subjectName?: string;
  gradeName?: string;
}

type Verdict = "correct" | "wrong" | "partial" | null;

/** Types whose AnswerArea renders the passage with inline inputs/zones, so
 *  the TryItPanel top content card would be a duplicate. */
const RENDERS_OWN_CONTENT = new Set<QuestionType>([
  "fill-blank",
  "drag-drop",
  "underline",
]);

export function TryItPanel({ values, type, onExit, subjectName, gradeName }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [reset, setReset] = useState(0);

  function doReset() {
    setSubmitted(false);
    setReset((r) => r + 1);
  }

  const content = (values.content ?? "") as string;
  const hasContent = content.trim().length > 0;

  return (
    <section className="overflow-hidden rounded-xl border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Blue title bar */}
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary to-[#1D4ED8] px-5 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
            <PlayCircle className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/75">
              Làm thử · giao diện học sinh
            </p>
            <p className="text-[14px] font-semibold">
              {subjectName ? subjectName : "Câu hỏi"}
              {gradeName ? ` · ${gradeName}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Đóng làm thử"
          title="Đóng làm thử"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          Đóng
        </button>
      </header>

      <div className="space-y-4 px-5 py-4">
        {!hasContent ? (
          <div className="rounded-lg border border-dashed bg-surface-2 px-4 py-10 text-center">
            <p className="text-section-title text-muted-foreground">
              Chưa có nội dung câu hỏi
            </p>
            <p className="text-meta mt-1">Nhập đề bài trước khi làm thử.</p>
          </div>
        ) : (
          <>
            {/* Skip the top content card for question types whose answer area
                already renders the passage inline (fill-blank, drag-drop,
                underline) — otherwise we'd show the same content twice. */}
            {!RENDERS_OWN_CONTENT.has(type) && (
              <div className="rounded-lg border bg-surface-2 p-4">
                <RenderedContent content={content} />
              </div>
            )}

            <AnswerArea
              key={reset}
              type={type}
              values={values}
              submitted={submitted}
              onSubmit={() => setSubmitted(true)}
            />
          </>
        )}
      </div>

      {/* Footer: Làm lại + Đóng + Nộp bài */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-[var(--color-surface-2)] px-5 py-3">
        <p className="text-meta italic">
          Đây là chế độ làm thử — câu hỏi chưa được lưu
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={doReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Làm lại
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onExit}>
            <X className="h-3.5 w-3.5" />
            Đóng
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={submitted}
            onClick={() => setSubmitted(true)}
          >
            <Check className="h-3.5 w-3.5" />
            {submitted ? "Đã nộp bài" : "Nộp bài"}
          </Button>
        </div>
      </footer>
    </section>
  );
}

/* ─────────────────────── Per-type answer UI ─────────────────────── */

function AnswerArea({
  type,
  values,
  submitted,
  onSubmit,
}: {
  type: QuestionType;
  values: any;
  submitted: boolean;
  onSubmit: () => void;
}) {
  switch (type) {
    case "mcq-single":
      return <McqSingleArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "mcq-multi":
      return <McqMultiArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "true-false":
      return <TrueFalseArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "multi-tf":
      return <MultiTfArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "short-answer":
      return <ShortAnswerArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "fill-blank":
      return <FillBlankArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "matching":
      return <MatchingArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "ordering":
      return <OrderingArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "drag-drop":
      return <DragDropArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "underline":
      return <UnderlineArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    case "essay":
      return <EssayArea values={values} submitted={submitted} onSubmit={onSubmit} />;
    default:
      return (
        <p className="text-meta italic">
          Dạng câu hỏi này chưa hỗ trợ làm thử.
        </p>
      );
  }
}

function VerdictBanner({ verdict, detail }: { verdict: Verdict; detail?: string }) {
  if (!verdict) return null;
  const tone =
    verdict === "correct"
      ? {
          bg: "bg-emerald-50",
          border: "border-emerald-300",
          textHeading: "text-emerald-800",
          textDetail: "text-emerald-700/80",
          emoji: "🎉",
          headline: "Chính xác!",
          fallback: "Bạn đã chọn đúng đáp án. Làm tốt lắm!",
        }
      : verdict === "partial"
        ? {
            bg: "bg-amber-50",
            border: "border-amber-300",
            textHeading: "text-amber-800",
            textDetail: "text-amber-700/80",
            emoji: "⚠️",
            headline: "Suýt rồi!",
            fallback: "Bạn đã làm đúng một phần. Xem lại các câu sai để chỉnh.",
          }
        : {
            bg: "bg-rose-50",
            border: "border-rose-300",
            textHeading: "text-rose-800",
            textDetail: "text-rose-700/80",
            emoji: "❌",
            headline: "Sai rồi",
            fallback: "Đáp án bạn chọn chưa đúng. Xem lời giải bên dưới để hiểu thêm.",
          };
  return (
    <div
      className={cn(
        "rounded-lg border-2 px-4 py-3 text-center",
        tone.bg,
        tone.border,
      )}
    >
      <p
        className={cn(
          "text-[16px] font-bold leading-tight",
          tone.textHeading,
        )}
      >
        <span className="mr-1.5 text-[18px]">{tone.emoji}</span>
        {tone.headline}
      </p>
      <p className={cn("text-[12px] mt-1 leading-relaxed", tone.textDetail)}>
        {detail || tone.fallback}
      </p>
    </div>
  );
}

function ActionRow({
  submitted,
  onSubmit,
  disabled,
}: {
  submitted: boolean;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  if (submitted) return null;
  return (
    <Button type="button" onClick={onSubmit} disabled={disabled}>
      <Check className="h-4 w-4" />
      Kiểm tra đáp án
    </Button>
  );
}

/* ─────────────────────── MCQ Single ─────────────────────── */

function McqSingleArea({ values, submitted, onSubmit }: AreaProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const opts: Array<{ id: string; content: string; isCorrect: boolean }> =
    values.options ?? [];
  const correctId = opts.find((o) => o.isCorrect)?.id;
  const verdict: Verdict = !submitted
    ? null
    : selected === correctId
      ? "correct"
      : "wrong";

  return (
    <div className="space-y-2.5">
      <ul className="space-y-1.5">
        {opts.map((o, i) => {
          const picked = selected === o.id;
          const showCorrect = submitted && o.isCorrect;
          const showWrong = submitted && picked && !o.isCorrect;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={submitted}
                onClick={() => setSelected(o.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  showCorrect && "border-emerald-400 bg-emerald-50",
                  showWrong && "border-rose-400 bg-rose-50",
                  !submitted && picked && "border-primary bg-primary/5",
                  !submitted && !picked && "border-border bg-surface hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                    showCorrect && "bg-emerald-500 text-white",
                    showWrong && "bg-rose-500 text-white",
                    !submitted && picked && "bg-primary text-white",
                    !showCorrect && !showWrong && !picked && "bg-muted text-foreground/70",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <RenderedContent inline content={o.content ?? ""} />
                </span>
                {showCorrect && <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />}
                {showWrong && <X className="h-4 w-4 text-rose-600" strokeWidth={2.5} />}
              </button>
            </li>
          );
        })}
      </ul>
      <VerdictBanner
        verdict={verdict}
        detail={
          verdict === "correct"
            ? "Bạn đã chọn đúng phương án."
            : verdict === "wrong"
              ? "Phương án bạn chọn chưa đúng — đáp án đúng được tô xanh."
              : undefined
        }
      />
    </div>
  );
}

/* ─────────────────────── MCQ Multi ─────────────────────── */

function McqMultiArea({ values, submitted, onSubmit }: AreaProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const opts: Array<{ id: string; content: string; isCorrect: boolean }> =
    values.options ?? [];

  const correctIds = new Set(opts.filter((o) => o.isCorrect).map((o) => o.id));
  const pickedCorrect = [...picked].filter((id) => correctIds.has(id)).length;
  const pickedWrong = [...picked].filter((id) => !correctIds.has(id)).length;
  const allCorrect = pickedCorrect === correctIds.size && pickedWrong === 0;
  const verdict: Verdict = !submitted
    ? null
    : allCorrect
      ? "correct"
      : pickedCorrect > 0
        ? "partial"
        : "wrong";

  function toggle(id: string) {
    if (submitted) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2.5">
      <ul className="space-y-1.5">
        {opts.map((o, i) => {
          const isPicked = picked.has(o.id);
          const isCorrect = o.isCorrect;
          const showCorrect = submitted && isCorrect;
          const showWrongPick = submitted && isPicked && !isCorrect;
          const showMissed = submitted && !isPicked && isCorrect;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={submitted}
                onClick={() => toggle(o.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  showCorrect && "border-emerald-400 bg-emerald-50",
                  showWrongPick && "border-rose-400 bg-rose-50",
                  showMissed && "border-amber-400 bg-amber-50",
                  !submitted && isPicked && "border-primary bg-primary/5",
                  !submitted && !isPicked && "border-border bg-surface hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                    showCorrect && "bg-emerald-500 text-white",
                    showWrongPick && "bg-rose-500 text-white",
                    showMissed && "bg-amber-500 text-white",
                    !submitted && isPicked && "bg-primary text-white",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <RenderedContent inline content={o.content ?? ""} />
                </span>
                {showCorrect && <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />}
                {showWrongPick && <X className="h-4 w-4 text-rose-600" strokeWidth={2.5} />}
              </button>
            </li>
          );
        })}
      </ul>
      <VerdictBanner
        verdict={verdict}
        detail={
          verdict === "correct"
            ? `Chọn đúng cả ${correctIds.size} phương án.`
            : verdict === "partial"
              ? `Chọn đúng ${pickedCorrect}/${correctIds.size} phương án. ${pickedWrong > 0 ? `(${pickedWrong} phương án sai bị chọn nhầm)` : ""}`
              : "Phương án bạn chọn chưa đúng."
        }
      />
    </div>
  );
}

/* ─────────────────────── True/False ─────────────────────── */

function TrueFalseArea({ values, submitted, onSubmit }: AreaProps) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const correct = Boolean(values.correctAnswer);
  const verdict: Verdict =
    !submitted ? null : picked === correct ? "correct" : "wrong";

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => {
          const isPicked = picked === v;
          const isCorrect = v === correct;
          const showCorrect = submitted && isCorrect;
          const showWrongPick = submitted && isPicked && !isCorrect;
          return (
            <button
              key={String(v)}
              type="button"
              disabled={submitted}
              onClick={() => setPicked(v)}
              className={cn(
                "rounded-lg border-2 px-4 py-3 text-center text-[15px] font-semibold transition-colors",
                showCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800",
                showWrongPick && "border-rose-400 bg-rose-50 text-rose-800",
                !submitted && isPicked && "border-primary bg-primary/10 text-primary",
                !submitted && !isPicked && "border-border bg-surface text-foreground/80 hover:bg-accent/40",
              )}
            >
              {v ? "Đúng" : "Sai"}
            </button>
          );
        })}
      </div>
      <VerdictBanner
        verdict={verdict}
        detail={
          verdict === "correct"
            ? "Bạn chọn đúng."
            : "Đáp án đúng là: " + (correct ? "Đúng" : "Sai")
        }
      />
    </div>
  );
}

/* ─────────────────────── Multi-TF ─────────────────────── */

function MultiTfArea({ values, submitted, onSubmit }: AreaProps) {
  const subs: Array<{ id: string; statement: string; correctAnswer: boolean }> =
    values.subQuestions ?? [];
  const [picks, setPicks] = useState<Record<string, boolean | null>>({});

  function set(id: string, v: boolean) {
    if (submitted) return;
    setPicks((prev) => ({ ...prev, [id]: v }));
  }

  const correct = subs.filter((s) => picks[s.id] === s.correctAnswer).length;
  const verdict: Verdict = !submitted
    ? null
    : correct === subs.length
      ? "correct"
      : correct > 0
        ? "partial"
        : "wrong";

  const allAnswered = subs.every((s) => typeof picks[s.id] === "boolean");

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2">
        {subs.map((s, i) => {
          const userPick = picks[s.id];
          const isMatch = userPick === s.correctAnswer;
          return (
            <li key={s.id} className="flex items-start gap-3 rounded-lg border bg-surface p-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[13px]">
                <RenderedContent inline content={s.statement ?? ""} />
                {submitted && (
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      isMatch
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-rose-300 bg-rose-50 text-rose-700",
                    )}
                  >
                    {isMatch ? "✓" : "✗"} Đáp án: {s.correctAnswer ? "Đúng" : "Sai"}
                  </span>
                )}
              </span>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() => set(s.id, true)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    userPick === true
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-border bg-card text-foreground/60 hover:bg-accent",
                  )}
                >
                  ✓ Đúng
                </button>
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() => set(s.id, false)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    userPick === false
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-border bg-card text-foreground/60 hover:bg-accent",
                  )}
                >
                  ✗ Sai
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <VerdictBanner
        verdict={verdict}
        detail={`Trả lời đúng ${correct}/${subs.length} câu phụ.`}
      />
    </div>
  );
}

/* ─────────────────────── Short Answer ─────────────────────── */

function ShortAnswerArea({ values, submitted, onSubmit }: AreaProps) {
  const [answer, setAnswer] = useState("");
  const accepted: string[] = values.acceptedAnswers ?? [];
  const caseSensitive = Boolean(values.caseSensitive);
  const norm = (s: string) =>
    caseSensitive ? s.trim() : s.trim().toLowerCase();
  const isCorrect = accepted.some((a) => norm(a) === norm(answer));
  const verdict: Verdict = !submitted ? null : isCorrect ? "correct" : "wrong";

  return (
    <div className="space-y-2.5">
      <Input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={submitted}
        placeholder="Nhập đáp án…"
        className={cn(
          submitted && isCorrect && "border-emerald-400 bg-emerald-50",
          submitted && !isCorrect && "border-rose-400 bg-rose-50",
        )}
      />
      <VerdictBanner
        verdict={verdict}
        detail={
          isCorrect
            ? "Đáp án của bạn khớp."
            : `Đáp án được chấp nhận: ${accepted.join(" · ") || "—"}`
        }
      />
    </div>
  );
}

/* ─────────────────────── Fill-blank ─────────────────────── */

function FillBlankArea({ values, submitted, onSubmit }: AreaProps) {
  const content: string = values.content ?? "";
  const blanks: { acceptedAnswers: string[] }[] = values.blanks ?? [];
  const blankCount = (content.match(/\[blank:\d+\]/g) ?? []).length;
  const [answers, setAnswers] = useState<string[]>(() =>
    Array.from({ length: blankCount }, () => ""),
  );

  function setAt(i: number, v: string) {
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  const correctness = useMemo(
    () =>
      answers.map((a, i) => {
        const accepted = blanks[i]?.acceptedAnswers ?? [];
        return accepted.some(
          (x) => x.trim().toLowerCase() === a.trim().toLowerCase(),
        );
      }),
    [answers, blanks],
  );

  const correctCount = correctness.filter(Boolean).length;
  const verdict: Verdict = !submitted
    ? null
    : correctCount === blankCount
      ? "correct"
      : correctCount > 0
        ? "partial"
        : "wrong";

  // Replace [blank:N] tokens with inline inputs to give a paragraph-style UI
  const segments = useMemo(() => {
    const out: Array<{ kind: "text" | "blank"; value: string; index?: number }> = [];
    const regex = /\[blank:(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      if (m.index > last) out.push({ kind: "text", value: content.slice(last, m.index) });
      out.push({ kind: "blank", value: "", index: Number(m[1]) - 1 });
      last = m.index + m[0].length;
    }
    if (last < content.length) out.push({ kind: "text", value: content.slice(last) });
    return out;
  }, [content]);

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border bg-surface p-4 text-[14px] leading-loose">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <RenderedContent inline key={i} content={seg.value} />
          ) : (
            <span key={i} className="mx-1 inline-block">
              <Input
                disabled={submitted}
                value={answers[seg.index!] ?? ""}
                onChange={(e) => setAt(seg.index!, e.target.value)}
                placeholder={`#${(seg.index ?? 0) + 1}`}
                className={cn(
                  "inline-block h-8 w-32 text-center text-[13px] align-middle",
                  submitted && correctness[seg.index!] && "border-emerald-400 bg-emerald-50",
                  submitted && !correctness[seg.index!] && "border-rose-400 bg-rose-50",
                )}
              />
            </span>
          ),
        )}
      </div>
      {submitted && (
        <ul className="space-y-1 rounded-lg border bg-surface-2 p-3 text-[12px]">
          {Array.from({ length: blankCount }).map((_, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-semibold text-foreground/70">Ô {i + 1}:</span>
              {correctness[i] ? (
                <span className="text-emerald-700">✓ {answers[i]}</span>
              ) : (
                <span>
                  <span className="text-rose-700">✗ {answers[i] || "(trống)"}</span>{" "}
                  · đáp án:{" "}
                  <span className="font-medium text-foreground/80">
                    {(blanks[i]?.acceptedAnswers ?? []).join(" · ")}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <VerdictBanner
        verdict={verdict}
        detail={`Điền đúng ${correctCount}/${blankCount} ô.`}
      />
    </div>
  );
}

interface AreaProps {
  values: any;
  submitted: boolean;
  onSubmit: () => void;
}

/* ─────────────────────── Matching (Ghép cặp) ─────────────────────── */

interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

function MatchingArea({ values, submitted, onSubmit }: AreaProps) {
  const pairs: MatchingPair[] = useMemo(
    () => (values.pairs ?? []).filter((p: MatchingPair) => p.left && p.right),
    [values.pairs],
  );

  // Right-side shuffled chips. Identified by `pair.id` of the pair they
  // originally belong to — student doesn't see this.
  const [shuffled, setShuffled] = useState<MatchingPair[]>(() =>
    shuffle(pairs),
  );
  // assignments[pair.id] = which chip is currently dropped on this row
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  // Resync shuffle on values change (e.g., user edits while testing)
  useEffect(() => {
    setShuffled(shuffle(pairs));
    setAssigned({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.map((p) => p.id).join("|")]);

  // Chips still in the pool (not yet assigned to any row)
  const poolIds = useMemo(() => {
    const used = new Set(Object.values(assigned).filter(Boolean) as string[]);
    return shuffled.map((p) => p.id).filter((id) => !used.has(id));
  }, [shuffled, assigned]);

  function handleDrop(rowId: string, chipId: string) {
    if (submitted) return;
    setAssigned((prev) => {
      const next: Record<string, string | null> = { ...prev };
      // If chip was previously in another row, free that row
      for (const [k, v] of Object.entries(next)) {
        if (v === chipId) next[k] = null;
      }
      next[rowId] = chipId;
      return next;
    });
    setDragging(null);
  }

  function handleRemoveFromRow(rowId: string) {
    if (submitted) return;
    setAssigned((prev) => ({ ...prev, [rowId]: null }));
  }

  const correctCount = pairs.filter(
    (p) => assigned[p.id] === p.id, // chip id == pair id (since we shuffle the same pair objects)
  ).length;

  const allAssigned = pairs.every((p) => assigned[p.id]);
  const verdict: Verdict = !submitted
    ? null
    : correctCount === pairs.length
      ? "correct"
      : correctCount > 0
        ? "partial"
        : "wrong";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Kéo các thẻ ở phía dưới lên ô trống bên phải mỗi mục cột A để ghép cặp.
          Có thể kéo lại để đổi.
        </p>
      </div>

      <div>
        <p className="text-eyebrow mb-2">Ghép các cặp tương ứng</p>
        <ul className="space-y-2">
          {pairs.map((p, i) => {
            const chipId = assigned[p.id];
            const chip = chipId ? shuffled.find((s) => s.id === chipId) : null;
            const isCorrect = submitted && chipId === p.id;
            const isWrong = submitted && chipId && chipId !== p.id;
            return (
              <li
                key={p.id}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
              >
                <div className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-white">
                    {i + 1}
                  </span>
                  <RenderedContent inline content={p.left} />
                </div>
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground"
                  strokeWidth={1.85}
                />
                <DropZone
                  isOver={dragging !== null && !submitted}
                  isFilled={Boolean(chip)}
                  isCorrect={isCorrect}
                  isWrong={Boolean(isWrong)}
                  onDrop={(chipId) => handleDrop(p.id, chipId)}
                  onClear={() => handleRemoveFromRow(p.id)}
                  submitted={submitted}
                >
                  {chip ? (
                    <div className="flex items-center justify-between gap-2 w-full">
                      <RenderedContent inline content={chip.right} />
                      {!submitted && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFromRow(p.id)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                          title="Bỏ ghép"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">
                      Thả giá trị vào đây…
                    </span>
                  )}
                </DropZone>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="text-eyebrow mb-2">
          Các giá trị {!submitted && "(kéo lên ô trống bên trên)"}
        </p>
        <div className="flex min-h-[48px] flex-wrap gap-2 rounded-lg border border-dashed bg-surface-2 p-3">
          {poolIds.length === 0 ? (
            <span className="text-meta italic">— đã kéo hết —</span>
          ) : (
            poolIds.map((id) => {
              const chip = shuffled.find((s) => s.id === id);
              if (!chip) return null;
              return (
                <DraggableChip
                  key={id}
                  chipId={id}
                  onDragStart={() => setDragging(id)}
                  onDragEnd={() => setDragging(null)}
                  disabled={submitted}
                >
                  <RenderedContent inline content={chip.right} />
                </DraggableChip>
              );
            })
          )}
        </div>
      </div>

      <VerdictBanner
        verdict={verdict}
        detail={`Ghép đúng ${correctCount}/${pairs.length} cặp.`}
      />
    </div>
  );
}

function DraggableChip({
  chipId,
  onDragStart,
  onDragEnd,
  disabled,
  children,
}: {
  chipId: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", chipId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "inline-flex cursor-grab items-center rounded-lg border bg-surface px-3 py-1.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all active:cursor-grabbing",
        disabled ? "opacity-50" : "hover:border-primary/50 hover:-translate-y-px",
      )}
    >
      {children}
    </span>
  );
}

function DropZone({
  isOver,
  isFilled,
  isCorrect,
  isWrong,
  onDrop,
  onClear,
  submitted,
  children,
}: {
  isOver: boolean;
  isFilled: boolean;
  isCorrect: boolean;
  isWrong: boolean;
  onDrop: (chipId: string) => void;
  onClear: () => void;
  submitted: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (submitted) return;
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (submitted) return;
        e.preventDefault();
        const chipId = e.dataTransfer.getData("text/plain");
        if (chipId) onDrop(chipId);
        setActive(false);
      }}
      onClick={() => {
        if (!submitted && isFilled) onClear();
      }}
      className={cn(
        "flex min-h-[46px] items-center rounded-lg border-2 border-dashed px-3 py-2 text-[13px] transition-colors",
        isCorrect && "border-emerald-400 bg-emerald-50",
        isWrong && "border-rose-400 bg-rose-50",
        !submitted && active && "border-primary bg-primary/5",
        !submitted && isOver && !active && "border-primary/40",
        !isCorrect && !isWrong && !active && !isOver && "border-border bg-surface",
      )}
    >
      {children}
    </div>
  );
}

/* ─────────────────────── Ordering (Sắp xếp) ─────────────────────── */

interface OrderingItem {
  id: string;
  content: string;
}

function OrderingArea({ values, submitted, onSubmit }: AreaProps) {
  const correctOrder: OrderingItem[] = useMemo(
    () => (values.items ?? []).filter((it: OrderingItem) => it.content),
    [values.items],
  );

  const [order, setOrder] = useState<OrderingItem[]>(() => shuffle(correctOrder));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);

  useEffect(() => {
    setOrder(shuffle(correctOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctOrder.map((i) => i.id).join("|")]);

  function moveItem(fromIdx: number, toIdx: number) {
    if (submitted) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    moveItem(idx, idx - 1);
  }
  function moveDown(idx: number) {
    if (idx === order.length - 1) return;
    moveItem(idx, idx + 1);
  }

  const correctCount = order.filter((it, i) => it.id === correctOrder[i]?.id).length;
  const verdict: Verdict = !submitted
    ? null
    : correctCount === correctOrder.length
      ? "correct"
      : correctCount > 0
        ? "partial"
        : "wrong";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Kéo thả các mục để sắp xếp đúng thứ tự (hoặc dùng nút ↑ ↓ bên phải).
        </p>
      </div>

      <ul className="space-y-2">
        {order.map((item, idx) => {
          const correctPos = correctOrder.findIndex((o) => o.id === item.id);
          const isCorrect = submitted && correctPos === idx;
          const isWrong = submitted && correctPos !== idx;
          return (
            <li
              key={item.id}
              onDragOver={(e) => {
                if (submitted || dragId === null) return;
                e.preventDefault();
                setDropOver(idx);
              }}
              onDrop={(e) => {
                if (submitted || dragId === null) return;
                e.preventDefault();
                const fromIdx = order.findIndex((o) => o.id === dragId);
                if (fromIdx !== -1 && fromIdx !== idx) moveItem(fromIdx, idx);
                setDragId(null);
                setDropOver(null);
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 transition-all",
                dragId === item.id && "opacity-40",
                dropOver === idx && dragId !== item.id && "border-primary ring-2 ring-primary/30",
                isCorrect && "border-emerald-400 bg-emerald-50",
                isWrong && "border-rose-400 bg-rose-50",
              )}
            >
              <button
                type="button"
                draggable={!submitted}
                onDragStart={(e) => {
                  setDragId(item.id);
                  e.dataTransfer.setData("text/plain", item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropOver(null);
                }}
                disabled={submitted}
                title="Kéo để sắp xếp"
                className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
              >
                <GripVertical className="h-3.5 w-3.5" strokeWidth={1.85} />
              </button>

              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold tabular-nums text-primary-text">
                {idx + 1}
              </span>

              <span className="min-w-0 flex-1 text-[13px]">
                <RenderedContent inline content={item.content} />
              </span>

              {submitted && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-rose-300 bg-rose-50 text-rose-700",
                  )}
                  title={`Đáp án đúng ở vị trí ${correctPos + 1}`}
                >
                  {isCorrect ? "✓" : `→${correctPos + 1}`}
                </span>
              )}

              {!submitted && (
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="inline-flex h-6 w-7 items-center justify-center rounded border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                    title="Lên 1 bậc"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === order.length - 1}
                    className="inline-flex h-6 w-7 items-center justify-center rounded border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                    title="Xuống 1 bậc"
                  >
                    ↓
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <VerdictBanner
        verdict={verdict}
        detail={`Sắp đúng ${correctCount}/${correctOrder.length} mục.`}
      />
    </div>
  );
}

/* ─────────────────────── Essay (Tự luận) ─────────────────────── */

function EssayArea({ values, submitted }: AreaProps) {
  const [answer, setAnswer] = useState("");
  const wordMin = Number(values.wordMin) || 0;
  const wordMax = Number(values.wordMax) || 0;
  const aiAssist = Boolean(values.aiAssist);

  const wordCount = useMemo(() => {
    const trimmed = answer.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [answer]);

  const tooFew = wordMin > 0 && wordCount < wordMin;
  const tooMany = wordMax > 0 && wordCount > wordMax;

  // No auto-grading for essay — verdict is just "submitted, awaiting review"
  const verdict: Verdict = submitted ? "partial" : null;

  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
        Bài làm của bạn
      </Label>
      <textarea
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={submitted}
        rows={10}
        placeholder="Viết câu trả lời của bạn ở đây…"
        className={cn(
          "block w-full rounded-lg border border-input bg-background px-4 py-3 text-[14px] leading-relaxed",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          submitted && "opacity-80",
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Số từ:</span>
          <span
            className={cn(
              "font-bold tabular-nums",
              tooFew && "text-rose-600",
              tooMany && "text-rose-600",
              !tooFew && !tooMany && wordCount > 0 && "text-emerald-600",
              wordCount === 0 && "text-foreground/70",
            )}
          >
            {wordCount}
          </span>
          {(wordMin > 0 || wordMax > 0) && (
            <span className="text-muted-foreground">
              {" / "}
              {wordMin > 0 && `tối thiểu ${wordMin}`}
              {wordMin > 0 && wordMax > 0 && " · "}
              {wordMax > 0 && `tối đa ${wordMax}`}
            </span>
          )}
        </div>
        <span className="italic text-muted-foreground">
          {aiAssist
            ? "Bài tự luận — AI chấm sơ bộ, giáo viên duyệt lại"
            : "Bài tự luận sẽ được giáo viên chấm tay"}
        </span>
      </div>

      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
          <p className="font-semibold">
            📝 Bài đã nộp · Chờ giáo viên chấm
          </p>
          {Array.isArray(values.rubric) && values.rubric.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {values.rubric.map(
                (r: { id: string; label: string; points: number }, i: number) => (
                  <li key={r.id ?? i} className="flex justify-between gap-3">
                    <span>• {r.label}</span>
                    <span className="font-semibold tabular-nums">
                      {r.points}đ
                    </span>
                  </li>
                ),
              )}
              <li className="mt-1 flex justify-between gap-3 border-t border-amber-200 pt-1 font-bold">
                <span>Tổng điểm</span>
                <span className="tabular-nums">
                  {values.rubric.reduce(
                    (s: number, r: { points: number }) =>
                      s + (Number(r.points) || 0),
                    0,
                  )}
                  đ
                </span>
              </li>
            </ul>
          )}
        </div>
      )}

      <VerdictBanner
        verdict={verdict}
        detail={
          submitted
            ? "Bài làm đã được nộp. Hệ thống không tự chấm — giáo viên sẽ chấm theo rubric."
            : undefined
        }
      />
    </div>
  );
}

/* ─────────────────────── Underline (Gạch chân) ─────────────────────── */

/**
 * Token-based underlining: split content into words + non-word separators,
 * track which word indices the student has underlined, and check against
 * the set of word-strings marked correct in `[u:...]` chips.
 */
function UnderlineArea({ values, submitted }: AreaProps) {
  const content: string = values.content ?? "";

  // 1) Pull the correct phrases from `[u:phrase]` markers
  const correctPhrases = useMemo(() => {
    const out: string[] = [];
    const re = /\[u:([^\]\n]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out.push(m[1]);
    return out;
  }, [content]);

  // 2) Strip markers to get the "plain" passage student sees
  const plainContent = useMemo(
    () => content.replace(/\[u:([^\]\n]+)\]/g, "$1"),
    [content],
  );

  // 3) Tokenise plain content: word | non-word | newline
  const tokens = useMemo(() => {
    const out: Array<{ kind: "word" | "sep" | "br"; value: string }> = [];
    const re = /(\n)|([\p{L}\p{N}]+(?:['']\p{L}+)?)|([^\p{L}\p{N}\n]+)/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plainContent)) !== null) {
      if (m[1] !== undefined) out.push({ kind: "br", value: "\n" });
      else if (m[2] !== undefined) out.push({ kind: "word", value: m[2] });
      else if (m[3] !== undefined) out.push({ kind: "sep", value: m[3] });
    }
    return out;
  }, [plainContent]);

  // 4) Build the set of correct word strings (case-insensitive)
  const correctWordSet = useMemo(() => {
    const set = new Set<string>();
    for (const phrase of correctPhrases) {
      for (const w of phrase.split(/\s+/)) {
        const norm = w.replace(/[^\p{L}\p{N}']+/gu, "").toLowerCase();
        if (norm) set.add(norm);
      }
    }
    return set;
  }, [correctPhrases]);

  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleWord(idx: number) {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // Verdict: count correct vs missed vs wrongly-picked
  const stats = useMemo(() => {
    let truePos = 0;
    let falsePos = 0;
    let falseNeg = 0;
    tokens.forEach((tk, i) => {
      if (tk.kind !== "word") return;
      const norm = tk.value.toLowerCase();
      const isCorrect = correctWordSet.has(norm);
      const isPicked = selected.has(i);
      if (isCorrect && isPicked) truePos++;
      else if (!isCorrect && isPicked) falsePos++;
      else if (isCorrect && !isPicked) falseNeg++;
    });
    return { truePos, falsePos, falseNeg };
  }, [tokens, selected, correctWordSet]);

  const totalCorrect = stats.truePos + stats.falseNeg;
  const verdict: Verdict = !submitted
    ? null
    : stats.falsePos === 0 && stats.falseNeg === 0
      ? "correct"
      : stats.truePos > 0
        ? "partial"
        : "wrong";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Click vào các từ trong đoạn dưới đây để gạch chân chúng. Click lại để
          bỏ. Sau đó bấm <span className="font-semibold">Nộp bài</span>.
        </p>
      </div>

      <div className="rounded-lg border bg-surface p-4 text-[15px] leading-loose">
        {tokens.map((tk, i) => {
          if (tk.kind === "br") return <br key={i} />;
          if (tk.kind === "sep") return <span key={i}>{tk.value}</span>;
          const isPicked = selected.has(i);
          const norm = tk.value.toLowerCase();
          const isAnswer = correctWordSet.has(norm);
          const tone = !submitted
            ? isPicked
              ? "underline decoration-2 decoration-primary text-primary font-semibold cursor-pointer rounded px-0.5 bg-primary/10"
              : "cursor-pointer rounded px-0.5 hover:bg-muted"
            : isPicked && isAnswer
              ? "underline decoration-2 decoration-emerald-600 text-emerald-800 font-semibold rounded px-0.5 bg-emerald-100"
              : isPicked && !isAnswer
                ? "line-through decoration-2 decoration-rose-600 text-rose-700 rounded px-0.5 bg-rose-100"
                : !isPicked && isAnswer
                  ? "underline decoration-2 decoration-amber-500 decoration-dashed text-amber-800 rounded px-0.5 bg-amber-50"
                  : "";
          return (
            <span
              key={i}
              onClick={() => toggleWord(i)}
              className={cn("transition-colors", tone)}
              title={
                submitted
                  ? isPicked && isAnswer
                    ? "✓ Bạn gạch chân đúng"
                    : isPicked && !isAnswer
                      ? "✗ Không cần gạch chân từ này"
                      : !isPicked && isAnswer
                        ? "⚠ Từ này cần gạch chân"
                        : undefined
                  : undefined
              }
            >
              {tk.value}
            </span>
          );
        })}
      </div>

      {submitted && (
        <ul className="space-y-1 rounded-lg border bg-surface-2 p-3 text-[12px]">
          <li className="flex items-center gap-2 text-emerald-700">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold">
              ✓ {stats.truePos}
            </span>
            <span>từ gạch chân đúng</span>
          </li>
          {stats.falsePos > 0 && (
            <li className="flex items-center gap-2 text-rose-700">
              <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold">
                ✗ {stats.falsePos}
              </span>
              <span>từ gạch nhầm (không nên gạch)</span>
            </li>
          )}
          {stats.falseNeg > 0 && (
            <li className="flex items-center gap-2 text-amber-700">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold">
                ⚠ {stats.falseNeg}
              </span>
              <span>từ bị bỏ sót (chưa gạch)</span>
            </li>
          )}
        </ul>
      )}

      <VerdictBanner
        verdict={verdict}
        detail={
          totalCorrect === 0
            ? "Đề bài chưa có cụm gạch chân nào — yêu cầu giáo viên đánh dấu."
            : `Gạch chân đúng ${stats.truePos}/${totalCorrect} từ${
                stats.falsePos > 0
                  ? ` · gạch nhầm ${stats.falsePos} từ`
                  : ""
              }.`
        }
      />
    </div>
  );
}

/* ─────────────────────── Drag-drop (Kéo thả) ─────────────────────── */

interface DragDropZone {
  id: string;
  correctContent: string;
}
interface DragDropDistractor {
  id: string;
  content: string;
}

function DragDropArea({ values, submitted }: AreaProps) {
  const zones: DragDropZone[] = useMemo(
    () => (values.zones ?? []).filter((z: DragDropZone) => z.correctContent),
    [values.zones],
  );
  const distractors: DragDropDistractor[] = useMemo(
    () => (values.distractors ?? []).filter((d: DragDropDistractor) => d.content),
    [values.distractors],
  );

  // Build pool: correct answers + distractors, each with a unique chipId
  const initialPool = useMemo(() => {
    const correct = zones.map((z, i) => ({
      chipId: `c-${i}`,
      content: z.correctContent,
      correctZoneId: z.id,
    }));
    const wrong = distractors.map((d, i) => ({
      chipId: `d-${i}`,
      content: d.content,
      correctZoneId: null as string | null,
    }));
    return shuffle([...correct, ...wrong]);
  }, [zones, distractors]);

  const [pool, setPool] = useState(initialPool);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    setPool(initialPool);
    setAssigned({});
  }, [initialPool]);

  // Parse content to render with zone chip → drop zone inline
  const content: string = values.content ?? "";
  const segments = useMemo(() => {
    const out: Array<{ kind: "text" | "zone"; value: string; zoneId?: string }> = [];
    const regex = /\[zone:(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      if (m.index > last) out.push({ kind: "text", value: content.slice(last, m.index) });
      const idx = Number(m[1]) - 1;
      const zone = zones[idx];
      if (zone) out.push({ kind: "zone", value: "", zoneId: zone.id });
      last = m.index + m[0].length;
    }
    if (last < content.length) out.push({ kind: "text", value: content.slice(last) });
    return out;
  }, [content, zones]);

  function handleDrop(zoneId: string, chipId: string) {
    if (submitted) return;
    setAssigned((prev) => {
      const next: Record<string, string | null> = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === chipId) next[k] = null;
      }
      next[zoneId] = chipId;
      return next;
    });
    setDragging(null);
  }
  function handleClear(zoneId: string) {
    if (submitted) return;
    setAssigned((prev) => ({ ...prev, [zoneId]: null }));
  }

  const usedChipIds = new Set(Object.values(assigned).filter(Boolean) as string[]);
  const poolRemaining = pool.filter((p) => !usedChipIds.has(p.chipId));

  const correctCount = zones.filter((z) => {
    const chipId = assigned[z.id];
    if (!chipId) return false;
    const chip = pool.find((p) => p.chipId === chipId);
    return chip?.content === z.correctContent;
  }).length;
  const allAssigned = zones.every((z) => assigned[z.id]);
  const verdict: Verdict = !submitted
    ? null
    : correctCount === zones.length
      ? "correct"
      : correctCount > 0
        ? "partial"
        : "wrong";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Kéo các cụm từ ở dưới thả vào các{" "}
          <ZoneChipMini2 /> trong đề bài. Có thể click vào vùng đã thả để bỏ
          ghép.
        </p>
      </div>

      {/* Content with inline drop zones */}
      <div className="rounded-lg border bg-surface p-4 text-[14px] leading-loose">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <RenderedContent inline key={i} content={seg.value} />
          ) : (
            <ZoneDrop
              key={seg.zoneId}
              zoneId={seg.zoneId!}
              chipId={assigned[seg.zoneId!] ?? null}
              chipContent={
                assigned[seg.zoneId!]
                  ? pool.find((p) => p.chipId === assigned[seg.zoneId!])?.content
                  : undefined
              }
              correctContent={zones.find((z) => z.id === seg.zoneId)?.correctContent ?? ""}
              isOver={Boolean(dragging) && !submitted}
              submitted={submitted}
              onDrop={(chipId) => handleDrop(seg.zoneId!, chipId)}
              onClear={() => handleClear(seg.zoneId!)}
              index={
                zones.findIndex((z) => z.id === seg.zoneId) + 1
              }
            />
          ),
        )}
      </div>

      {/* Pool of draggable chips */}
      <div>
        <p className="text-eyebrow mb-2">
          Cụm từ để kéo {!submitted && "(kéo lên đề bài bên trên)"}
        </p>
        <div className="flex min-h-[48px] flex-wrap gap-2 rounded-lg border border-dashed bg-surface-2 p-3">
          {poolRemaining.length === 0 ? (
            <span className="text-meta italic">— đã kéo hết —</span>
          ) : (
            poolRemaining.map((p) => (
              <DraggableChip
                key={p.chipId}
                chipId={p.chipId}
                onDragStart={() => setDragging(p.chipId)}
                onDragEnd={() => setDragging(null)}
                disabled={submitted}
              >
                <RenderedContent inline content={p.content} />
              </DraggableChip>
            ))
          )}
        </div>
      </div>

      <VerdictBanner
        verdict={verdict}
        detail={`Ghép đúng ${correctCount}/${zones.length} vùng.`}
      />
    </div>
  );
}

function ZoneChipMini2() {
  return (
    <span className="mx-0.5 inline-flex items-center gap-0.5 rounded border border-dashed border-amber-500 bg-amber-50 px-1 align-middle text-[11px] font-semibold text-amber-700">
      <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
        N
      </span>
      vùng thả
    </span>
  );
}

function ZoneDrop({
  zoneId,
  chipId,
  chipContent,
  correctContent,
  isOver,
  submitted,
  onDrop,
  onClear,
  index,
}: {
  zoneId: string;
  chipId: string | null;
  chipContent?: string;
  correctContent: string;
  isOver: boolean;
  submitted: boolean;
  onDrop: (chipId: string) => void;
  onClear: () => void;
  index: number;
}) {
  const [active, setActive] = useState(false);
  const isFilled = Boolean(chipContent);
  const isCorrect = submitted && chipContent === correctContent;
  const isWrong = submitted && isFilled && !isCorrect;
  return (
    <span
      onDragOver={(e) => {
        if (submitted) return;
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (submitted) return;
        e.preventDefault();
        const cid = e.dataTransfer.getData("text/plain");
        if (cid) onDrop(cid);
        setActive(false);
      }}
      onClick={() => {
        if (!submitted && isFilled) onClear();
      }}
      className={cn(
        "mx-1 inline-flex min-w-[100px] items-center justify-center gap-1 rounded-md border-2 border-dashed px-2 py-0.5 align-middle text-[13px] transition-colors",
        isCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800",
        isWrong && "border-rose-400 bg-rose-50 text-rose-800",
        !submitted && active && "border-primary bg-primary/10",
        !submitted && isOver && !active && "border-primary/40",
        !isFilled && !active && !isOver && "border-amber-500/70 bg-amber-50",
      )}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
        {index}
      </span>
      {chipContent ? (
        <span className="font-semibold">{chipContent}</span>
      ) : (
        <span className="italic text-muted-foreground">Thả vào đây</span>
      )}
    </span>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
