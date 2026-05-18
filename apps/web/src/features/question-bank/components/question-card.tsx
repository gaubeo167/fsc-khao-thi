"use client";

import { Copy, Eye, PencilLine, Trash2 } from "lucide-react";
import { memo } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import { findQuestionType } from "../data/question-types";
import type { Question } from "../data/seed-questions";

import { RenderedContent } from "./rendered-content";

interface Props {
  question: Question;
  /** Index in the list — drives the zebra striping. */
  index?: number;
  onView: (q: Question) => void;
  onEdit: (q: Question) => void;
  onDuplicate?: (q: Question) => void;
  onDelete: (q: Question) => void;
}

const DIFFICULTY_LABEL: Record<Question["difficulty"], string> = {
  easy: "Nhận biết",
  medium: "Thông hiểu",
  hard: "Vận dụng",
};

const STATUS_LABEL: Record<Question["status"], string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  draft: "Bản nháp",
  rejected: "Từ chối",
};

function QuestionCardImpl({
  question,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const meta = findQuestionType(question.type);
  const subject = subjects.find((s) => s.id === question.subjectId);
  const grade = grades.find((g) => g.id === question.gradeId);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border border-border bg-surface transition-all",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "hover:border-[var(--color-border-hover)] hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)] hover:-translate-y-px",
      )}
    >
      {/* Header */}
      <header className="flex items-center gap-2 border-b bg-[var(--color-surface-2)] px-4 py-2.5">
        <span className="rounded-md bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/75">
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{
            backgroundColor: `${meta.color}1A`,
            color: meta.color,
          }}
        >
          {meta.shortName}
        </span>

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          ID: {question.id}
        </span>

        <div className="flex items-center gap-1">
          <IconButton size="sm" title="Xem" onClick={() => onView(question)}>
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton size="sm" variant="primary" title="Chỉnh sửa" onClick={() => onEdit(question)}>
            <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          {onDuplicate && (
            <IconButton
              size="sm"
              title={
                question.kho === "campus"
                  ? "Sao chép sang kho cá nhân"
                  : "Sao chép sang kho trường (cần duyệt)"
              }
              onClick={() => onDuplicate(question)}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          )}
          <IconButton size="sm" variant="destructive" title="Xoá" onClick={() => onDelete(question)}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </header>

      {/* Body */}
      <div className="space-y-3 px-4 py-3.5">
        <div className="text-[14px] font-medium leading-relaxed text-foreground">
          <RenderedContent content={question.content} />
        </div>
        <AnswerPreview question={question} />
      </div>

      {/* Footer */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-[var(--color-surface-2)] px-4 py-2.5 text-meta">
        {grade && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
            {grade.code}
          </span>
        )}
        {subject && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: `${subject.color}1A`, color: subject.color }}
          >
            {subject.name}
          </span>
        )}
        <span className="text-muted-foreground">
          Tạo bởi:{" "}
          <span className="font-medium text-foreground/75">{question.ownerName}</span>
        </span>
        <span className="text-muted-foreground">
          ·{" "}
          {question.kho === "campus" ? (
            <span className="text-blue-700">Kho campus</span>
          ) : (
            <span>Kho cá nhân</span>
          )}
        </span>

        <StatusBadge variant={question.status} className="ml-auto">
          {STATUS_LABEL[question.status]}
        </StatusBadge>
      </footer>
    </article>
  );
}

// Cards are heavy — they render math via KaTeX, inline media, etc. Memoising
// is the difference between "smooth filter typing" and "noticeable jank" on
// the question bank page where many cards mount together.
export const QuestionCard = memo(QuestionCardImpl);

function AnswerPreview({ question }: { question: Question }) {
  switch (question.type) {
    case "mcq-single":
    case "mcq-multi":
      return (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {question.options.map((opt, i) => (
            <li
              key={opt.id}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]",
                opt.isCorrect
                  ? "border-[#86EFAC] bg-[#DCFCE7]/60"
                  : "border-border bg-surface",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                  opt.isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1 text-foreground/85">
                <RenderedContent content={opt.content} />
              </span>
              {opt.isCorrect && (
                <span className="ml-auto rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#166534]">
                  Đúng
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    case "true-false":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <div
              key={String(v)}
              className={cn(
                "rounded-lg border px-3 py-2 text-center text-[13px] font-medium",
                question.correctAnswer === v
                  ? v
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-red-300 bg-red-50 text-red-700"
                  : "border-border bg-muted/30 text-muted-foreground",
              )}
            >
              {v ? "Đúng" : "Sai"}
            </div>
          ))}
        </div>
      );
    case "multi-tf":
      return (
        <ul className="space-y-1.5">
          {question.subQuestions.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[13px]"
            >
              <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1">
                <RenderedContent inline content={s.statement} />
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  s.correctAnswer
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700",
                )}
              >
                {s.correctAnswer ? "Đúng" : "Sai"}
              </span>
            </li>
          ))}
        </ul>
      );
    case "short-answer":
      return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-[13px]">
          <span className="text-meta">Đáp án chấp nhận:</span>
          {question.acceptedAnswers.map((a) => (
            <span
              key={a}
              className="rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200"
            >
              <RenderedContent inline content={a} className="text-emerald-700" />
            </span>
          ))}
        </div>
      );
    case "fill-blank":
      return (
        <ul className="space-y-1.5">
          {question.blanks.map((b, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-[13px]"
            >
              <span className="text-meta">Blank #{i + 1}:</span>
              {b.acceptedAnswers.map((a) => (
                <span
                  key={a}
                  className="rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                >
                  <RenderedContent inline content={a} className="text-emerald-700" />
                </span>
              ))}
            </li>
          ))}
        </ul>
      );
    case "matching":
      return (
        <ul className="space-y-1.5">
          {question.pairs.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-[13px]"
            >
              <RenderedContent inline content={p.left} />
              <span aria-hidden className="text-muted-foreground">↔</span>
              <RenderedContent inline content={p.right} className="text-foreground/80" />
            </li>
          ))}
        </ul>
      );
    case "ordering":
      return (
        <ol className="space-y-1.5">
          {question.items.map((it, i) => (
            <li
              key={it.id}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-[13px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                {i + 1}
              </span>
              <RenderedContent inline content={it.content} />
            </li>
          ))}
        </ol>
      );
    case "drag-drop": {
      const zones = question.zones ?? [];
      const distractors = question.distractors ?? [];
      return (
        <div className="space-y-2">
          <p className="text-meta">
            {zones.length} vùng thả · {distractors.length} cụm gây nhiễu
          </p>
          <div className="flex flex-wrap gap-1.5">
            {zones.map((z, i) => (
              <span
                key={z.id}
                className="inline-flex items-center gap-1 rounded-md border bg-emerald-50 px-2 py-0.5 text-[12px] ring-1 ring-emerald-200"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <RenderedContent inline content={z.correctContent ?? ""} />
              </span>
            ))}
            {distractors.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 rounded-md border bg-rose-50 px-2 py-0.5 text-[12px] ring-1 ring-rose-200"
              >
                <span className="text-rose-600">✗</span>
                <RenderedContent inline content={d.content ?? ""} />
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "essay": {
      const rubric = question.rubric ?? [];
      const total = rubric.reduce((s, c) => s + (Number(c.points) || 0), 0);
      const wmin = question.wordMin ?? 0;
      const wmax = question.wordMax ?? 0;
      const range =
        wmin && wmax
          ? `${wmin} – ${wmax} từ`
          : wmin
            ? `≥ ${wmin} từ`
            : wmax
              ? `≤ ${wmax} từ`
              : "Không giới hạn từ";
      return (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[13px] leading-relaxed text-foreground/85">
          <p className="text-meta mb-1.5">
            {rubric.length} tiêu chí · Tổng {total}đ · {range}
            {question.aiAssist ? " · ✨ AI chấm sơ bộ" : ""}
          </p>
          <ul className="space-y-0.5 text-[12px]">
            {rubric.slice(0, 3).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate">• {c.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {c.points}đ
                </span>
              </li>
            ))}
            {rubric.length > 3 && (
              <li className="text-meta italic">
                và {rubric.length - 3} tiêu chí khác…
              </li>
            )}
          </ul>
        </div>
      );
    }
    case "underline": {
      const phrases = (question.content.match(/\[u:([^\]\n]+)\]/g) ?? []).map(
        (m) => m.slice(3, -1),
      );
      return (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[13px]">
          <p className="text-meta mb-1">
            {phrases.length} cụm cần gạch chân:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phrases.map((p, i) => (
              <span
                key={`${i}-${p}`}
                className="rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800 underline decoration-2 decoration-emerald-600 underline-offset-2 ring-1 ring-emerald-200"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "ai-generated":
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <p className="text-meta mb-1 text-amber-700">AI prompt:</p>
          <p className="line-clamp-2">{question.prompt}</p>
        </div>
      );
  }
}
