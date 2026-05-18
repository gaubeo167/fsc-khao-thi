import type { ScoringConfig } from "../data/types";
import type {
  Difficulty,
  Question,
} from "@/features/question-bank/data/seed-questions";

/**
 * Compute the per-question score map under a given ScoringConfig for a
 * concrete list of questions. The return is `{ questionId → score }`,
 * such that `Σ score === maxScore` (within rounding error).
 *
 * Rounding strategy: scores are returned as floating-point numbers; the
 * UI rounds to 2 decimals for display. For "manual" mode the user input
 * is trusted as-is.
 */
export function computePerQuestionScores(
  scoring: ScoringConfig,
  questions: Question[],
): Record<string, number> {
  if (questions.length === 0) return {};
  const out: Record<string, number> = {};
  switch (scoring.mode) {
    case "even": {
      const each = scoring.maxScore / questions.length;
      for (const q of questions) out[q.id] = each;
      return out;
    }
    case "by-difficulty": {
      const w = scoring.difficultyWeights ?? {
        easy: 1,
        medium: 1.5,
        hard: 2,
      };
      const totalWeight = questions.reduce(
        (a, q) => a + (w[q.difficulty] ?? 1),
        0,
      );
      if (totalWeight === 0) {
        const each = scoring.maxScore / questions.length;
        for (const q of questions) out[q.id] = each;
        return out;
      }
      for (const q of questions) {
        out[q.id] = (scoring.maxScore * (w[q.difficulty] ?? 1)) / totalWeight;
      }
      return out;
    }
    case "manual": {
      const pq = scoring.perQuestion ?? {};
      for (const q of questions) {
        out[q.id] = Number.isFinite(pq[q.id]) ? (pq[q.id] as number) : 0;
      }
      return out;
    }
  }
}

/** Convenience: count questions per difficulty. Useful for preview UI. */
export function countByDifficulty(
  questions: Question[],
): Record<Difficulty, number> {
  const acc: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) acc[q.difficulty]++;
  return acc;
}

/** Per-difficulty score preview when mode === "by-difficulty". */
export function difficultyScorePreview(
  scoring: ScoringConfig,
  questions: Question[],
): Record<Difficulty, number> {
  if (scoring.mode !== "by-difficulty") {
    return { easy: 0, medium: 0, hard: 0 };
  }
  const w = scoring.difficultyWeights ?? { easy: 1, medium: 1.5, hard: 2 };
  const totalWeight = questions.reduce(
    (a, q) => a + (w[q.difficulty] ?? 1),
    0,
  );
  if (totalWeight === 0) return { easy: 0, medium: 0, hard: 0 };
  return {
    easy: (scoring.maxScore * (w.easy ?? 1)) / totalWeight,
    medium: (scoring.maxScore * (w.medium ?? 1)) / totalWeight,
    hard: (scoring.maxScore * (w.hard ?? 1)) / totalWeight,
  };
}

/** Total of perQuestion map — used to validate manual mode. */
export function sumManualPerQuestion(
  scoring: ScoringConfig,
  questionIds: string[],
): number {
  if (scoring.mode !== "manual") return scoring.maxScore;
  const pq = scoring.perQuestion ?? {};
  return questionIds.reduce(
    (a, id) => a + (Number.isFinite(pq[id]) ? (pq[id] as number) : 0),
    0,
  );
}

/** Pretty-print a score with up to 2 decimals, dropping trailing zeros. */
export function formatScore(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n * 100) / 100 + "";
}
