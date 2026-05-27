"use client";

import { Check, Eye, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { isCorrect } from "@/features/shift-exam/lib/is-correct";
import type { Answer } from "@/features/shift-exam/state/attempts-store";
import { cn } from "@/lib/utils";

import type { HomeworkAttempt } from "../data/types";

const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  studentUsername?: string;
  attempt: HomeworkAttempt | null;
  questions: Question[];
}

/**
 * Per-student drill-down. Shows: header (name + score + nộp lúc), then
 * a list of each question with the student's answer, the right/wrong
 * indicator, and an "👁 Xem" button that opens the full question
 * detail (same dialog used in the picker).
 */
export function HomeworkAttemptDetailDialog({
  open,
  onOpenChange,
  studentName,
  studentUsername,
  attempt,
  questions,
}: Props) {
  const [viewing, setViewing] = useState<Question | null>(null);

  const score = attempt?.correctCount ?? 0;
  const total = attempt?.totalQuestions ?? questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b bg-gradient-to-r from-blue-50 to-cyan-50 px-5 py-4">
          <DialogTitle>{studentName}</DialogTitle>
          <DialogDescription className="mt-0.5">
            {studentUsername ? `${studentUsername} · ` : ""}
            {attempt?.submittedAt
              ? `Nộp lúc ${new Date(attempt.submittedAt).toLocaleString("vi-VN")}`
              : "Chưa nộp bài"}
          </DialogDescription>
          {attempt?.submittedAt ? (
            <div className="mt-3 inline-flex items-center gap-3 rounded-lg border bg-card px-3 py-1.5">
              <span className="font-mono text-[18px] font-bold text-foreground">
                {score}
                <span className="text-foreground/40">/{total}</span>
              </span>
              <span className="text-meta">·</span>
              <span
                className={cn(
                  "font-semibold",
                  percent >= 70
                    ? "text-emerald-700"
                    : percent >= 40
                      ? "text-amber-700"
                      : "text-rose-700",
                )}
              >
                {percent}% đúng
              </span>
            </div>
          ) : null}
        </DialogHeader>

        <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-4">
          {!attempt?.submittedAt ? (
            <div className="rounded-lg border border-dashed bg-muted/15 px-6 py-10 text-center text-meta">
              Học sinh chưa nộp bài. Khi HS nộp, chi tiết bài làm sẽ hiển
              thị tại đây.
            </div>
          ) : (
            <ol className="space-y-3">
              {questions.map((q, idx) => {
                const ans = attempt.answers[q.id];
                const right = ans ? isCorrect(q, ans) : false;
                return (
                  <li
                    key={q.id}
                    className={cn(
                      "rounded-lg border bg-card px-4 py-3",
                      right ? "border-emerald-200" : "border-rose-200",
                    )}
                  >
                    <div className="mb-2 flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          right
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {right ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <X className="h-3.5 w-3.5" strokeWidth={3} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-muted-foreground">
                          Câu {idx + 1} · {q.type} · {q.difficulty}
                        </p>
                        <div className="mt-0.5 text-[13px] font-medium">
                          <RenderedContent content={q.content} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewing(q)}
                        className="rounded-md border bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Xem chi tiết câu hỏi"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <AnswerSummary q={q} a={ans} />
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <ViewQuestionDialog
          question={viewing}
          onClose={() => setViewing(null)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Compact display of the student's answer side-by-side with the
 *  correct answer hint. Same flavor as the report detail page. */
function AnswerSummary({ q, a }: { q: Question; a: Answer | undefined }) {
  if (!a) {
    return (
      <p className="text-[11.5px] italic text-muted-foreground">
        Học sinh không trả lời.
      </p>
    );
  }
  switch (q.type) {
    case "mcq-single": {
      const chosen =
        a.kind === "mcq-single"
          ? q.options.find((o) => o.id === a.optionId)
          : null;
      const correct = q.options.find((o) => o.isCorrect);
      return (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Box label="HS chọn">{chosen?.content ?? "(bỏ trống)"}</Box>
          <Box label="Đáp án">{correct?.content ?? "—"}</Box>
        </div>
      );
    }
    case "mcq-multi": {
      const chosen =
        a.kind === "mcq-multi"
          ? q.options
              .filter((o) => a.optionIds.includes(o.id))
              .map((o) => o.content)
          : [];
      const correct = q.options.filter((o) => o.isCorrect).map((o) => o.content);
      return (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Box label="HS chọn">{chosen.join(" · ") || "(bỏ trống)"}</Box>
          <Box label="Đáp án">{correct.join(" · ")}</Box>
        </div>
      );
    }
    case "true-false":
      return (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Box label="HS chọn">
            {a.kind === "true-false" && a.value != null
              ? a.value
                ? "Đúng"
                : "Sai"
              : "(bỏ trống)"}
          </Box>
          <Box label="Đáp án">{q.correctAnswer ? "Đúng" : "Sai"}</Box>
        </div>
      );
    case "short-answer":
      return (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Box label="HS trả lời">
            {a.kind === "short-answer" ? a.text : "(bỏ trống)"}
          </Box>
          <Box label="Đáp án chấp nhận">{q.acceptedAnswers.join(" / ")}</Box>
        </div>
      );
    case "fill-blank":
      return (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Box label="HS điền">
            {a.kind === "fill-blank"
              ? a.blanks.map((b, i) => `(${i + 1}) ${b}`).join(" · ")
              : "(bỏ trống)"}
          </Box>
          <Box label="Đáp án">
            {q.blanks
              .map((b, i) => `(${i + 1}) ${b.acceptedAnswers.join("/")}`)
              .join(" · ")}
          </Box>
        </div>
      );
    default:
      return (
        <p className="text-[11.5px] text-muted-foreground">
          Bài làm chi tiết hiển thị bằng cách bấm "Xem chi tiết câu hỏi".
        </p>
      );
  }
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/15 px-2.5 py-1.5">
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[12.5px] text-foreground/85">{children}</p>
    </div>
  );
}
