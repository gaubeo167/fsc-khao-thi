import type { Question } from "@/features/question-bank/data/seed-questions";
import type { ExamOrderStrategy } from "@/features/exam-forms/data/types";

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

/** One section (mạch/phần) of a draft exam, in blueprint topic order. */
export interface DraftSection {
  topicId: string;
  name: string;
  questionIds: string[];
}

export interface DraftExam {
  /** Final question order (flattened across sections). */
  questionIds: string[];
  /** Per-section grouping in blueprint order — populated for every
   *  strategy so materialize can stamp section names when asked; the
   *  ORDER of `questionIds` already reflects the chosen strategy. */
  sections: DraftSection[];
}

/**
 * Generate `n` exams matching the package's matrix. For each exam:
 *   1. Partition each topic's picked IDs by difficulty
 *   2. Random-draw the matrix-defined count per (topic, difficulty)
 *   3. Order according to `orderStrategy`:
 *        - "by-section": keep blueprint topic order, shuffle WITHIN each
 *          topic → exam keeps its Phần I / II / III structure.
 *        - "shuffle-all": one global shuffle across all picked questions.
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
  orderStrategy: ExamOrderStrategy = "shuffle-all",
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

  // Normalised content per question — used to avoid two questions with the
  // SAME content landing in one đề (the bank may hold content-duplicates
  // created by importing/seeding the same file more than once).
  const normContent = (s?: string) =>
    (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const contentOf = (id: string) => normContent(questionsById.get(id)?.content);

  const exams: DraftExam[] = [];
  for (let i = 0; i < n; i++) {
    // Track ids already placed in this paper so we never duplicate within
    // one exam, even if the same id is reachable through multiple topics.
    const taken = new Set<string>();
    // Track content too, so content-duplicates (different ids) don't both
    // appear in the same đề.
    const takenContent = new Set<string>();
    // Draw the matrix, bucketing by topic so we can preserve sections.
    const drawnByTopic = new Map<string, string[]>();
    for (const row of pkg.matrix) {
      let drawn: string[] = [];
      if (row.cpCounts) {
        // CP mode: draw per chủ điểm (tocNodeId), then the "ngoài CP" bucket.
        const topic = blueprint.topics.find((t) => t.id === row.topicId);
        if (!topic) continue;
        const cpSet = new Set(Object.keys(row.cpCounts));
        for (const [nodeId, count] of Object.entries(row.cpCounts)) {
          const cpPool = topic.pickedQuestionIds.filter(
            (qid) => questionsById.get(qid)?.tocNodeId === nodeId,
          );
          drawn.push(...drawN(cpPool, count, taken, takenContent, contentOf));
        }
        if (row.outsideCount && row.outsideCount > 0) {
          const outPool = topic.pickedQuestionIds.filter((qid) => {
            const q = questionsById.get(qid);
            if (!q) return false; // archived / deleted — not in the pool
            const t = q.tocNodeId ?? null;
            return !t || !cpSet.has(t);
          });
          drawn.push(...drawN(outPool, row.outsideCount, taken, takenContent, contentOf));
        }
      } else {
        const pool = pools.get(row.topicId);
        if (!pool) continue;
        drawn = [
          ...drawN(pool.easy, row.easyCount, taken, takenContent, contentOf),
          ...drawN(pool.medium, row.mediumCount, taken, takenContent, contentOf),
          ...drawN(pool.hard, row.hardCount, taken, takenContent, contentOf),
        ];
      }
      if (drawn.length === 0) continue;
      const prev = drawnByTopic.get(row.topicId) ?? [];
      drawnByTopic.set(row.topicId, [...prev, ...drawn]);
    }

    // Assemble sections in blueprint topic order (= the teacher's Phần
    // 1-2-3 order), applying the chosen ordering per section.
    const sections: DraftSection[] = [];
    for (const topic of blueprint.topics) {
      const ids = drawnByTopic.get(topic.id);
      if (!ids || ids.length === 0) continue;
      // Shuffle within the section so different đề vary, while the section
      // itself stays a contiguous block in blueprint order.
      sections.push({ topicId: topic.id, name: topic.name, questionIds: shuffle(ids) });
    }

    const grouped = sections.flatMap((s) => s.questionIds);
    // "shuffle-all" collapses the section structure into one global order.
    const questionIds =
      orderStrategy === "shuffle-all" ? shuffle(grouped) : grouped;

    exams.push({ questionIds, sections });
  }
  return exams;
}

/**
 * Draw `count` items from `pool` (random subset), skipping ids that are
 * already in `taken`. Mutates `taken` with whatever it returns so subsequent
 * calls within the same exam stay unique.
 */
function drawN(
  pool: string[],
  count: number,
  taken: Set<string>,
  takenContent: Set<string>,
  contentOf: (id: string) => string,
): string[] {
  if (count <= 0) return [];
  const shuffled = shuffle(pool.filter((id) => !taken.has(id)));
  const picked: string[] = [];
  // Pick one at a time, skipping ids whose content is already taken (either
  // in a previous drawN or earlier in THIS call) so content-duplicates never
  // both land in one đề.
  for (const id of shuffled) {
    if (picked.length >= count) break;
    const c = contentOf(id);
    if (takenContent.has(c)) continue;
    picked.push(id);
    taken.add(id);
    takenContent.add(c);
  }
  return picked;
}

export function totalMatrixCount(matrix: PackageMatrixRow[]): number {
  return matrix.reduce(
    (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
    0,
  );
}
