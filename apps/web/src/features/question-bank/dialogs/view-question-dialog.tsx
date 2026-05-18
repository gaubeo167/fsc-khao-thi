"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { findQuestionType } from "../data/question-types";
import type { Question } from "../data/seed-questions";
import { RenderedContent } from "../components/rendered-content";
import { cn } from "@/lib/utils";

interface Props {
  question: Question | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<Question["status"], string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  draft: "Bản nháp",
  rejected: "Từ chối",
};

const DIFFICULTY_LABEL: Record<Question["difficulty"], string> = {
  easy: "Dễ — Nhận biết",
  medium: "Trung bình — Thông hiểu",
  hard: "Khó — Vận dụng",
};

export function ViewQuestionDialog({ question, onClose }: Props) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);

  if (!question) return null;

  const meta = findQuestionType(question.type);
  const Icon = meta.icon;
  const subject = subjects.find((s) => s.id === question.subjectId);
  const grade = grades.find((g) => g.id === question.gradeId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl p-0 max-h-[88vh] overflow-y-auto"
        srTitle={`Xem câu hỏi ${question.id}`}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${meta.color}1A`,
              color: meta.color,
            }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">
              <span className="font-mono">{question.id}</span>
            </h2>
            <p className="text-meta mt-0.5">
              {meta.name} · {subject?.name ?? "?"} · {grade?.name ?? "?"}
            </p>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          <Section title="Nội dung">
            <div className="rounded-lg border bg-surface p-4">
              <RenderedContent content={question.content} />
            </div>
          </Section>

          <Section title="Đáp án">
            <AnswerView question={question} />
          </Section>

          {question.explanation && (
            <Section title="Giải thích">
              <div className="rounded-lg border bg-surface p-4">
                <RenderedContent content={question.explanation} />
              </div>
            </Section>
          )}

          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-[12px] text-foreground/80">
            <Meta label="Người tạo">{question.ownerName}</Meta>
            <Meta label="Kho">
              {question.kho === "campus" ? "Kho campus" : "Kho cá nhân"}
            </Meta>
            <Meta label="Trạng thái">
              <StatusBadge variant={question.status}>
                {STATUS_LABEL[question.status]}
              </StatusBadge>
            </Meta>
            <Meta label="Độ khó">{DIFFICULTY_LABEL[question.difficulty]}</Meta>
            <Meta label="Tạo lúc">
              {new Date(question.createdAt).toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </Meta>
            {question.tags.length > 0 && (
              <Meta label="Tags">
                <span className="inline-flex flex-wrap gap-1">
                  {question.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </Meta>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AnswerView({ question }: { question: Question }) {
  switch (question.type) {
    case "mcq-single":
    case "mcq-multi":
      return (
        <ul className="space-y-1.5">
          {question.options.map((o, i) => (
            <li
              key={o.id}
              className={cn(
                "relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                o.isCorrect
                  ? "border-[#86EFAC] bg-[#DCFCE7]/60"
                  : "border-border bg-surface",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                  o.isCorrect
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-foreground/85">
                <RenderedContent content={o.content} />
              </span>
              {o.isCorrect && (
                <span className="ml-auto rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#166534]">
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
          {[true, false].map((v) => {
            const isCorrect = question.correctAnswer === v;
            return (
              <div
                key={String(v)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-center text-[13px] font-medium",
                  isCorrect
                    ? v
                      ? "border-[#86EFAC] bg-[#DCFCE7]/60 text-[#166534]"
                      : "border-[#FCA5A5] bg-[#FEE2E2]/60 text-[#991B1B]"
                    : "border-border bg-surface text-muted-foreground",
                )}
              >
                {v ? "Đúng" : "Sai"}
                {isCorrect && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.04em]">
                    · đáp án
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );

    case "multi-tf":
      return (
        <ul className="space-y-1.5">
          {question.subQuestions.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-[13px]"
            >
              <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1">
                <RenderedContent content={s.statement} />
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
                  s.correctAnswer
                    ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]"
                    : "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]",
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
        <div className="rounded-lg border bg-surface p-3 text-[13px]">
          <p className="text-meta mb-2">Đáp án chấp nhận:</p>
          <div className="flex flex-wrap gap-1.5">
            {question.acceptedAnswers.map((a) => (
              <span
                key={a}
                className="rounded-full border border-[#86EFAC] bg-[#DCFCE7]/60 px-2 py-0.5 text-[12px] font-medium text-[#166534]"
              >
                <RenderedContent inline content={a} className="text-[#166534]" />
              </span>
            ))}
          </div>
          <p className="text-meta mt-2">
            {question.caseSensitive
              ? "Phân biệt chữ hoa/thường"
              : "Không phân biệt chữ hoa/thường"}
          </p>
        </div>
      );

    case "fill-blank":
      return (
        <ul className="space-y-1.5">
          {question.blanks.map((b, i) => (
            <li key={i} className="rounded-lg border bg-surface p-3">
              <p className="text-meta mb-1.5">Blank #{i + 1}:</p>
              <div className="flex flex-wrap gap-1.5">
                {b.acceptedAnswers.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-[#86EFAC] bg-[#DCFCE7]/60 px-2 py-0.5 text-[12px] font-medium text-[#166534]"
                  >
                    <RenderedContent inline content={a} className="text-[#166534]" />
                  </span>
                ))}
              </div>
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
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-[13px]"
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
              className="flex items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 text-[13px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-soft)] text-[11px] font-bold tabular-nums text-[var(--color-primary-text)]">
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
        <div className="space-y-3">
          <div>
            <p className="text-eyebrow mb-2">Vùng thả & đáp án đúng</p>
            <ul className="space-y-1.5">
              {zones.map((z, i) => (
                <li
                  key={z.id}
                  className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-[13px]"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <RenderedContent inline content={z.correctContent ?? ""} />
                </li>
              ))}
            </ul>
          </div>
          {distractors.length > 0 && (
            <div>
              <p className="text-eyebrow mb-2">Cụm gây nhiễu</p>
              <div className="flex flex-wrap gap-1.5">
                {distractors.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 rounded-md border bg-rose-50 px-2 py-0.5 text-[12px] text-rose-700 ring-1 ring-rose-200"
                  >
                    ✗ <RenderedContent inline content={d.content ?? ""} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    case "essay": {
      const rubric = question.rubric ?? [];
      const total = rubric.reduce((s, c) => s + (Number(c.points) || 0), 0);
      const wmin = question.wordMin ?? 0;
      const wmax = question.wordMax ?? 0;
      return (
        <div className="space-y-3">
          <div className="rounded-lg border bg-surface p-3 text-[13px]">
            <p className="text-eyebrow mb-2">Rubric chấm điểm</p>
            <ul className="space-y-1.5">
              {rubric.map((c) => (
                <li
                  key={c.id}
                  className="flex justify-between gap-3 border-b border-dashed pb-1 last:border-b-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">{c.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-primary">
                    {c.points}đ
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 pt-1 font-bold">
                <span>Tổng điểm</span>
                <span className="tabular-nums">{total}đ</span>
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-[12px] text-foreground/80">
            <span>
              <span className="text-meta">Số từ tối thiểu: </span>
              <span className="font-semibold">{wmin || "không"}</span>
            </span>
            <span>
              <span className="text-meta">Số từ tối đa: </span>
              <span className="font-semibold">{wmax || "không"}</span>
            </span>
            <span>
              <span className="text-meta">AI chấm sơ bộ: </span>
              <span className="font-semibold">
                {question.aiAssist ? "Bật" : "Tắt"}
              </span>
            </span>
          </div>
        </div>
      );
    }

    case "underline": {
      const phrases = (question.content.match(/\[u:([^\]\n]+)\]/g) ?? []).map(
        (m) => m.slice(3, -1),
      );
      return (
        <div className="space-y-2">
          <p className="text-meta">
            {phrases.length} cụm cần gạch chân (đã hiển thị gạch chân trong
            phần "Nội dung" ở trên)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phrases.map((p, i) => (
              <span
                key={`${i}-${p}`}
                className="rounded-md border bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800 underline decoration-2 decoration-emerald-600 underline-offset-2 ring-1 ring-emerald-200"
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
          <p className="text-meta mb-1 text-amber-700">AI prompt:</p>
          <p>{question.prompt}</p>
        </div>
      );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-eyebrow mb-2">{title}</p>
      {children}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-meta">{label}</p>
      <div className="mt-0.5 font-medium text-foreground/85">{children}</div>
    </div>
  );
}
