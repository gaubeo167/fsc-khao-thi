/**
 * Single source of truth for "did the student get this question right?".
 * Used by:
 *   - attempts-store gradeOne() at exam submit time
 *   - reports/[shiftId]/attempts/[attemptId] for per-question correctness display
 *   - homework-attempts-store at submit time
 *
 * The historical inline copies in result/page.tsx and reports page are
 * being migrated to this module to avoid divergence.
 */

import type { Question } from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";

export function isCorrect(q: Question, a: Answer): boolean {
  switch (q.type) {
    case "mcq-single":
      if (a.kind !== "mcq-single" || !a.optionId) return false;
      return q.options.find((o) => o.isCorrect)?.id === a.optionId;
    case "mcq-multi": {
      if (a.kind !== "mcq-multi") return false;
      const correctIds = new Set(
        q.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      return (
        a.optionIds.length === correctIds.size &&
        a.optionIds.every((id) => correctIds.has(id))
      );
    }
    case "true-false":
      return a.kind === "true-false" && a.value === q.correctAnswer;
    case "multi-tf":
      return (
        a.kind === "multi-tf" &&
        q.subQuestions.every((s) => a.values[s.id] === s.correctAnswer)
      );
    case "short-answer": {
      if (a.kind !== "short-answer") return false;
      const norm = (s: string) =>
        q.caseSensitive ? s.trim() : s.trim().toLowerCase();
      return q.acceptedAnswers.map(norm).includes(norm(a.text));
    }
    case "fill-blank": {
      if (a.kind !== "fill-blank") return false;
      return q.blanks.every((b, i) => {
        const guess = (a.blanks[i] ?? "").trim().toLowerCase();
        return b.acceptedAnswers
          .map((s) => s.trim().toLowerCase())
          .includes(guess);
      });
    }
    case "matching":
      return (
        a.kind === "matching" &&
        q.pairs.every((p) => a.pairings[p.id] === p.id)
      );
    case "ordering": {
      if (a.kind !== "ordering") return false;
      const correct = q.items.map((it) => it.id);
      return (
        a.orderedIds.length === correct.length &&
        a.orderedIds.every((id, i) => id === correct[i])
      );
    }
    case "drag-drop": {
      if (a.kind !== "drag-drop") return false;
      const norm = (s: string) => (s ?? "").trim().toLowerCase();
      return q.zones.every(
        (z, i) => norm(a.zones[i] ?? "") === norm(z.correctContent),
      );
    }
    case "underline": {
      if (a.kind !== "underline") return false;
      const correctSet = new Set<string>();
      const re = /\[u:([^\]\n]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        correctSet.add(m[1]!.trim().toLowerCase());
      }
      const studentSet = new Set(
        a.underlinedPhrases.map((p) => p.trim().toLowerCase()),
      );
      return (
        studentSet.size === correctSet.size &&
        Array.from(correctSet).every((p) => studentSet.has(p))
      );
    }
    default:
      return false;
  }
}
