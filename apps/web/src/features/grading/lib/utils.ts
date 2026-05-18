import type { ExamShift } from "@/features/exam-shifts/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";

/**
 * Deterministic anonymous exam code for a `(shift, student)` pair.
 *
 * Per khảo-thí convention, the grader should see ONLY a code — never the
 * student's name or class — so bias (familiar handwriting, class
 * reputation) doesn't influence the score. The mapping is stable, so
 * resuming a workspace yields the same code; the `studentId` is preserved
 * in the saved grade record for audit/reveal-after-grading.
 *
 * Encoding: djb2 hash → 4 base-36 chars. Collisions within a shift are
 * astronomically unlikely (~10^6 codespace per shift) for our scale.
 */
export function gradingCode(shiftId: string, studentId: string): string {
  let h = 5381;
  const key = `${shiftId}|${studentId}`;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  const positive = h >>> 0;
  const enc = positive.toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return `EX-${enc}`;
}

/**
 * Question types that require manual / AI-assisted grading. Auto-scored
 * types (mcq, true-false, fill-blank, matching, ordering, drag-drop,
 * underline, short-answer) are NOT returned here.
 */
export function isManualGradingType(type: Question["type"]): boolean {
  return type === "essay" || type === "ai-generated";
}

/** Returns true if the shift uses at least one question requiring manual grading. */
export function shiftHasManualQuestions(
  shift: ExamShift,
  questions: Question[],
): boolean {
  // We can't determine the exact question set without resolving the
  // package/blueprint here. Caller passes pre-resolved questions OR we
  // fall back to "true" if uncertain. The callers that care actually
  // pass the resolved list.
  return questions.some((q) => isManualGradingType(q.type));
}

/**
 * Combine the auto-graded MCQ score with manually-graded essay scores.
 * Returns the final score on a 0-100 scale (matching the existing field).
 *
 * Weighting: auto-graded counts as 1 point per question (matching the
 * existing `attempt.score = correctCount / maxScore * 100`). Essay points
 * count using their rubric weights. The combined score = round(
 *   (autoCorrect + essayPoints) / (autoMax + essayMax) * 100
 * ).
 */
export function combineScores(args: {
  autoCorrect: number;
  autoMax: number;
  essayPoints: number;
  essayMax: number;
}): { combined: number; total: number; max: number } {
  const total = args.autoCorrect + args.essayPoints;
  const max = args.autoMax + args.essayMax;
  return {
    combined: max > 0 ? Math.round((total / max) * 100) : 0,
    total,
    max,
  };
}
