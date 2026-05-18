"use client";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { findQuestionType } from "@/features/question-bank/data/question-types";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";

import type { GeneratedExam } from "../data/types";

interface Props {
  exam: GeneratedExam | null;
  onClose(): void;
}

export function ViewGeneratedDialog({ exam, onClose }: Props) {
  const allQuestions = useQuestionsStore((s) => s.questions);
  if (!exam) return null;
  const questions = exam.questionIds
    .map((id) => allQuestions.find((q) => q.id === id))
    .filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 max-h-[92vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-200">
            <FileText className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">{exam.name}</DialogTitle>
            <p className="text-meta mt-0.5">
              {questions.length} câu · Thời gian: {exam.duration} phút · Mã:{" "}
              <span className="font-mono">{exam.id}</span>
            </p>
          </div>
        </header>

        <ol className="space-y-3 px-6 py-5">
          {questions.map((q, i) => {
            if (!q) return null;
            const meta = findQuestionType(q.type);
            return (
              <li
                key={`${i}-${q.id}`}
                className="rounded-xl border bg-card p-3"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-text">
                    {i + 1}
                  </span>
                  <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                    {q.id}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                    style={{
                      backgroundColor: `${meta.color}1A`,
                      color: meta.color,
                    }}
                  >
                    {meta.shortName}
                  </span>
                </div>
                <div className="text-[14px]">
                  <RenderedContent content={q.content} />
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="flex items-center justify-end border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Đóng
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
