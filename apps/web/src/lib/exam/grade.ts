/**
 * Pure auto-grading logic — shared by the client (demo mode) and the
 * server-authoritative submit route (/api/exam/[shiftId]/submit).
 *
 * NO client-only deps (no zustand/react), so it can run in a route
 * handler with the Admin SDK. Answer/Question are type-only imports
 * (erased at compile), so importing from the "use client" attempts-store
 * pulls no runtime client code.
 *
 * `score` is a 0–100 PERCENT (correct / auto-gradable-count × 100),
 * `maxScore` is the auto-gradable question COUNT — matching the historical
 * representation the rest of the app already reads (see compute-progress
 * and the result page).
 */

import type { Question } from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";

export function gradeQuestion(
  q: Question,
  a: Answer | undefined,
): { points: number; correct: boolean } | null {
  if (!a) return { points: 0, correct: false };
  switch (q.type) {
    case "mcq-single": {
      if (a.kind !== "mcq-single" || !a.optionId) return { points: 0, correct: false };
      const correct = q.options.find((o) => o.isCorrect)?.id;
      return correct === a.optionId
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "mcq-multi": {
      if (a.kind !== "mcq-multi") return { points: 0, correct: false };
      const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
      const chosen = new Set(a.optionIds);
      const same =
        chosen.size === correctIds.size &&
        Array.from(correctIds).every((id) => chosen.has(id));
      return same ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "true-false": {
      if (a.kind !== "true-false" || a.value == null) return { points: 0, correct: false };
      return a.value === q.correctAnswer
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "short-answer": {
      if (a.kind !== "short-answer") return { points: 0, correct: false };
      const norm = (s: string) => (q.caseSensitive ? s.trim() : s.trim().toLowerCase());
      const accepted = q.acceptedAnswers.map(norm);
      return accepted.includes(norm(a.text))
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "fill-blank": {
      if (a.kind !== "fill-blank") return { points: 0, correct: false };
      const allOk = q.blanks.every((b, i) => {
        const guess = (a.blanks[i] ?? "").trim().toLowerCase();
        return b.acceptedAnswers.map((s) => s.trim().toLowerCase()).includes(guess);
      });
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "multi-tf": {
      if (a.kind !== "multi-tf") return { points: 0, correct: false };
      const allOk = q.subQuestions.every((sub) => a.values[sub.id] === sub.correctAnswer);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "matching": {
      if (a.kind !== "matching") return { points: 0, correct: false };
      const allOk = q.pairs.every((p) => a.pairings[p.id] === p.id);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "ordering": {
      if (a.kind !== "ordering") return { points: 0, correct: false };
      const correct = q.items.map((it) => it.id);
      const allOk =
        a.orderedIds.length === correct.length &&
        a.orderedIds.every((id, i) => id === correct[i]);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "drag-drop": {
      if (a.kind !== "drag-drop") return { points: 0, correct: false };
      const norm = (s: string) => s.trim().toLowerCase();
      const allOk = q.zones.every((z, i) => norm(a.zones[i] ?? "") === norm(z.correctContent));
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "underline": {
      if (a.kind !== "underline") return { points: 0, correct: false };
      const correctSet = new Set<string>();
      const re = /\[u:([^\]\n]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        correctSet.add(m[1]!.trim().toLowerCase());
      }
      const studentSet = new Set(a.underlinedPhrases.map((p) => p.trim().toLowerCase()));
      const exactMatch =
        studentSet.size === correctSet.size &&
        Array.from(correctSet).every((p) => studentSet.has(p));
      return exactMatch ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    // Essay / AI-generated are manually graded → excluded from auto-score.
    case "essay":
    case "ai-generated":
      return null;
    default:
      return null;
  }
}

export interface AutoScore {
  /** 0–100 percent over auto-gradable questions. */
  score: number;
  correctCount: number;
  /** Count of auto-gradable questions. */
  maxScore: number;
}

export function computeAttemptScore(
  questions: Question[],
  answers: Record<string, Answer>,
): AutoScore {
  let correctCount = 0;
  let scored = 0;
  let max = 0;
  for (const q of questions) {
    const result = gradeQuestion(q, answers[q.id]);
    if (result == null) continue; // essay/ai — manual
    max += 1;
    if (result.correct) correctCount += 1;
    scored += result.points;
  }
  const score = max > 0 ? Math.round((scored / max) * 100) : 0;
  return { score, correctCount, maxScore: max };
}
