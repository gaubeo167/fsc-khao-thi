"use client";

import type { AttemptDetailResponse } from "@fsc/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

import { useSubmitAttempt } from "../api/hooks";
import { useAutosaveController } from "../state/autosave-controller";
import { useRuntimeStore } from "../state/runtime-store";
import type { ExamBank } from "../types";

import { AutosaveIndicator } from "./autosave-indicator";
import { LockedState } from "./locked-state";
import { QuestionNavigator } from "./question-navigator";
import { QuestionRenderer } from "./question-renderer";
import { StatusBar } from "./status-bar";
import { SubmitDialog } from "./submit-dialog";
import { Timer } from "./timer";

interface FormShape {
  answers: Record<string, string>;
}

interface ExamRuntimeProps {
  attempt: AttemptDetailResponse;
  bank: ExamBank;
}

export function ExamRuntime({ attempt, bank }: ExamRuntimeProps) {
  const router = useRouter();
  const submitMutation = useSubmitAttempt();

  const locked = attempt.status !== "IN_PROGRESS";

  const hydrate = useRuntimeStore((s) => s.hydrate);
  const setIndex = useRuntimeStore((s) => s.setIndex);
  const setDraft = useRuntimeStore((s) => s.setDraft);
  const currentIndex = useRuntimeStore((s) => s.currentIndex);
  const drafts = useRuntimeStore((s) => s.drafts);
  const statuses = useRuntimeStore((s) => s.statuses);
  const endsAt = useRuntimeStore((s) => s.endsAt);

  // Hydrate store from server detail (responses + remainingTimeMs).
  useEffect(() => {
    hydrate({
      attemptId: attempt.id,
      remainingTimeMs: attempt.remainingTimeMs,
      locked,
      responses: attempt.responses,
    });
  }, [
    hydrate,
    attempt.id,
    attempt.remainingTimeMs,
    attempt.responses,
    locked,
  ]);

  const controller = useAutosaveController(locked ? null : attempt.id);

  const form = useForm<FormShape>({
    defaultValues: { answers: {} },
  });

  // Mirror the hydrated store into RHF on first ready render.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededRef.current === attempt.id) return;
    const current = useRuntimeStore.getState().drafts;
    form.reset({ answers: current });
    seededRef.current = attempt.id;
  }, [attempt.id, form, drafts]);

  const handleAnswer = useCallback(
    (qid: string, value: string) => {
      if (locked) return;
      setDraft(qid, value);
      controller?.schedule(qid, value);
    },
    [controller, locked, setDraft],
  );

  const questions = bank.questions;
  const total = questions.length;
  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, total - 1));
  const current = questions[safeIndex];

  const goPrev = useCallback(() => {
    setIndex(Math.max(0, safeIndex - 1));
  }, [safeIndex, setIndex]);

  const goNext = useCallback(() => {
    setIndex(Math.min(total - 1, safeIndex + 1));
  }, [safeIndex, setIndex, total]);

  useKeyboardShortcuts({
    ArrowLeft: () => goPrev(),
    ArrowRight: () => goNext(),
    "1": () => current?.type === "mcq" && current.options[0] && handleAnswer(current.id, current.options[0].id),
    "2": () => current?.type === "mcq" && current.options[1] && handleAnswer(current.id, current.options[1].id),
    "3": () => current?.type === "mcq" && current.options[2] && handleAnswer(current.id, current.options[2].id),
    "4": () => current?.type === "mcq" && current.options[3] && handleAnswer(current.id, current.options[3].id),
    "5": () => current?.type === "mcq" && current.options[4] && handleAnswer(current.id, current.options[4].id),
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await controller?.flushAll();
      await submitMutation.mutateAsync(attempt.id);
      router.push(`/attempts/${attempt.id}/submitted`);
    } catch (err) {
      console.error("submit failed", err);
      setSubmitting(false);
    }
  }, [attempt.id, controller, router, submitMutation]);

  const answered = useMemo(
    () => questions.filter((q) => Boolean(drafts[q.id])).length,
    [questions, drafts],
  );
  const hasUnsavedDrafts = useMemo(
    () => Object.values(statuses).some((s) => s === "dirty" || s === "error"),
    [statuses],
  );

  if (locked) {
    return (
      <>
        <StatusBar title={bank.title} right={<AutosaveIndicator />} />
        <LockedState status={attempt.status} submittedAt={attempt.submittedAt} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <StatusBar
        title={bank.title}
        left={
          endsAt ? <Timer endsAt={endsAt} onExpire={handleSubmit} /> : null
        }
        right={
          <>
            <AutosaveIndicator />
            <SubmitDialog
              answered={answered}
              total={total}
              submitting={submitting}
              hasUnsavedDrafts={hasUnsavedDrafts}
              onConfirm={handleSubmit}
            >
              <Button size="sm">Submit</Button>
            </SubmitDialog>
          </>
        }
      />

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="max-h-[70vh]">
                <QuestionNavigator questions={questions} />
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        <section>
          <Card>
            <CardContent className="p-8">
              {current ? (
                <QuestionRenderer
                  question={current}
                  index={safeIndex}
                  total={total}
                  control={form.control}
                  onChange={(v) => handleAnswer(current.id, v)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No questions.</p>
              )}
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goPrev} disabled={safeIndex === 0}>
              ← Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {safeIndex + 1} / {total}
            </span>
            {safeIndex < total - 1 ? (
              <Button onClick={goNext}>Next →</Button>
            ) : (
              <SubmitDialog
                answered={answered}
                total={total}
                submitting={submitting}
                hasUnsavedDrafts={hasUnsavedDrafts}
                onConfirm={handleSubmit}
              >
                <Button>Review & submit</Button>
              </SubmitDialog>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
