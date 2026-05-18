import type { Question } from "@/features/question-bank/data/seed-questions";

import type {
  ExamBlueprint,
  ExamPackage,
  PackageMatrixRow,
} from "../data/types";

/** Fisher–Yates shuffle (in-place on a copy). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface DraftExam {
  questionIds: string[];
}

/**
 * Generate `n` exams matching the package's matrix. For each exam:
 *   1. Partition each topic's picked IDs by difficulty
 *   2. Random-draw the matrix-defined count per (topic, difficulty)
 *   3. Concat across topics and shuffle the final order
 *
 * Each generated exam is independent — different question subsets and
 * different orders, so two students taking different "đề" never see the
 * same paper.
 */
export function generateExams(
  blueprint: ExamBlueprint,
  pkg: ExamPackage,
  questionsById: Map<string, Question>,
  n: number,
): DraftExam[] {
  // Pre-partition each topic by difficulty so we don't redo work each round.
  // Legacy blueprints (created before cross-mạch dedup landed) may include
  // the same question in multiple topics — we keep the partitions per topic
  // for matrix counting but enforce paper-level uniqueness below.
  const pools = new Map<
    string,
    { easy: string[]; medium: string[]; hard: string[] }
  >();
  for (const topic of blueprint.topics) {
    const buckets = { easy: [] as string[], medium: [] as string[], hard: [] as string[] };
    for (const qid of topic.pickedQuestionIds) {
      const q = questionsById.get(qid);
      if (!q) continue;
      buckets[q.difficulty].push(qid);
    }
    pools.set(topic.id, buckets);
  }

  const exams: DraftExam[] = [];
  for (let i = 0; i < n; i++) {
    const chosen: string[] = [];
    // Track ids already placed in this paper so we never duplicate within
    // one exam, even if the same id is reachable through multiple topics.
    const taken = new Set<string>();
    for (const row of pkg.matrix) {
      const pool = pools.get(row.topicId);
      if (!pool) continue;
      chosen.push(...drawN(pool.easy, row.easyCount, taken));
      chosen.push(...drawN(pool.medium, row.mediumCount, taken));
      chosen.push(...drawN(pool.hard, row.hardCount, taken));
    }
    exams.push({ questionIds: shuffle(chosen) });
  }
  return exams;
}

/**
 * Draw `count` items from `pool` (random subset), skipping ids that are
 * already in `taken`. Mutates `taken` with whatever it returns so subsequent
 * calls within the same exam stay unique.
 */
function drawN(pool: string[], count: number, taken: Set<string>): string[] {
  if (count <= 0) return [];
  const eligible = pool.filter((id) => !taken.has(id));
  const shuffled = shuffle(eligible);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  for (const id of picked) taken.add(id);
  return picked;
}

export function totalMatrixCount(matrix: PackageMatrixRow[]): number {
  return matrix.reduce(
    (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
    0,
  );
}
