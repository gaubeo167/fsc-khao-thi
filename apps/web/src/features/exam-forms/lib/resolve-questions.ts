/**
 * Resolve the Question[] that should be displayed for a given attempt.
 *
 * Preference order:
 *   1. attempt.examFormId + variantId → frozen snapshot (preferred —
 *      what the student actually saw at exam time).
 *   2. Legacy fallback: walk attempt.questionIds and look them up in
 *      the live /questions store (drift-prone, used only for attempts
 *      created before snapshots existed).
 *
 * Returns an ordered list matching `attempt.questionIds` order. Snapshot
 * questions retain their original `id` field (= original question id),
 * so existing grader / renderer code that keys by id keeps working.
 */

import type { Question } from "@/features/question-bank/data/seed-questions";

import type { ExamForm } from "../data/types";

interface ResolveArgs {
  questionIds: string[];
  examFormId?: string | null;
  variantId?: string | null;
  allForms: ExamForm[];
  allLiveQuestions: Question[];
}

export interface ResolveResult {
  questions: Question[];
  /** True when we read from a frozen snapshot. False = legacy fallback. */
  fromSnapshot: boolean;
  /** The form used, if any. */
  form: ExamForm | null;
}

export function resolveAttemptQuestions(args: ResolveArgs): ResolveResult {
  const form = args.examFormId
    ? args.allForms.find((f) => f.id === args.examFormId) ?? null
    : null;
  if (form && args.variantId) {
    const variant = form.variants.find((v) => v.variantId === args.variantId);
    if (variant) {
      // Preserve attempt.questionIds order — students may have shuffled
      // before save, so the snapshot's intrinsic order isn't always the
      // student's order.
      const byOriginalId = new Map(
        variant.questions.map((qs) => [qs.originalQuestionId, qs]),
      );
      const ordered: Question[] = [];
      for (const qid of args.questionIds) {
        const snap = byOriginalId.get(qid);
        if (snap) ordered.push(snap as unknown as Question);
      }
      // If the attempt's question id list and the variant's snapshot list
      // are out-of-sync (shouldn't happen, but be defensive), append the
      // missing snapshots in their canonical order.
      if (ordered.length !== variant.questions.length) {
        for (const snap of variant.questions) {
          if (!args.questionIds.includes(snap.originalQuestionId)) {
            ordered.push(snap as unknown as Question);
          }
        }
      }
      return { questions: ordered, fromSnapshot: true, form };
    }
  }
  // Legacy fallback.
  const legacy = args.questionIds
    .map((qid) => args.allLiveQuestions.find((q) => q.id === qid))
    .filter((q): q is Question => !!q);
  return { questions: legacy, fromSnapshot: false, form };
}
