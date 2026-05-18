"use client";

import { cn } from "@/lib/utils";

import { useRuntimeStore } from "../state/runtime-store";
import type { Question, SaveStatus } from "../types";

interface NavigatorProps {
  questions: Question[];
}

function dotClass(status: SaveStatus | undefined): string {
  switch (status) {
    case "saved":
      return "bg-[var(--color-success)]";
    case "saving":
      return "bg-[var(--color-warning)] animate-pulse";
    case "dirty":
      return "bg-[var(--color-warning)]";
    case "error":
      return "bg-destructive";
    default:
      return "bg-transparent";
  }
}

export function QuestionNavigator({ questions }: NavigatorProps) {
  const currentIndex = useRuntimeStore((s) => s.currentIndex);
  const setIndex = useRuntimeStore((s) => s.setIndex);
  const drafts = useRuntimeStore((s) => s.drafts);
  const statuses = useRuntimeStore((s) => s.statuses);

  return (
    <nav aria-label="Câu hỏi" className="space-y-3">
      <h2 className="text-eyebrow px-1">Câu hỏi</h2>
      <ol className="grid grid-cols-5 gap-1.5 lg:grid-cols-4 xl:grid-cols-5">
        {questions.map((q, i) => {
          const active = i === currentIndex;
          const answered = Boolean(drafts[q.id]);
          const status = statuses[q.id];
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={active ? "step" : undefined}
                aria-label={`Câu ${i + 1}${answered ? ", đã trả lời" : ", chưa trả lời"}`}
                className={cn(
                  "relative flex h-9 w-full items-center justify-center rounded-md border text-[13px] font-medium tabular-nums transition-colors",
                  active && "border-primary bg-primary text-primary-foreground",
                  !active && answered && "border-primary/40 bg-primary/5 text-foreground",
                  !active && !answered && "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {i + 1}
                <span
                  className={cn(
                    "absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
                    dotClass(status),
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-meta px-1">
        <kbd className="rounded border bg-muted px-1">←</kbd>{" "}
        <kbd className="rounded border bg-muted px-1">→</kbd> chuyển câu ·{" "}
        <kbd className="rounded border bg-muted px-1">1-5</kbd> chọn đáp án
      </p>
    </nav>
  );
}
