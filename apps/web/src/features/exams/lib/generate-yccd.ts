/**
 * YCCĐ-based exam generation — draws by the MOET matrix (Bài × phần × Bloom)
 * instead of (mạch × difficulty). Produces the same `DraftExam` shape so it
 * flows through the existing preview + runtime bridges unchanged.
 *
 * Structure:
 *   - Rows   = topic competencies (Bài / Chủ đề, kind === "topic").
 *   - Cols   = configurable PARTS (cấu phần, 2–4) × Bloom (Biết/Hiểu/Vận dụng).
 *   - A question is placed by (topic of its primary outcome × its part × its
 *     bloom). Exam SECTIONS group by part (Phần I / II / …).
 *
 * Determinism via seeded mulberry32; câu-level uniqueness via shared
 * taken/takenContent across the whole paper.
 */
import type { BloomLevel } from "@/features/competencies/data/types";
import type { QuestionType } from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { ExamOrderStrategy } from "@/features/exam-forms/data/types";

import type { YccdMatrix, YccdMatrixCell, YccdPart } from "../data/types";

import {
  drawN,
  makeContentOf,
  mulberry32,
  normContent,
  shuffle,
  type DraftExam,
  type DraftSection,
} from "./generate";

/** The part a QuestionType belongs to, given the selected parts (null = none). */
export function partIdForType(
  parts: YccdPart[],
  t: QuestionType,
): string | null {
  for (const p of parts) if (p.questionTypes.includes(t)) return p.id;
  return null;
}

/** A question's primary outcome — question-level first, else per-ý / per-option. */
export function primaryOutcome(q: Question): string | null {
  if (q.competencyIds && q.competencyIds.length > 0) return q.competencyIds[0]!;
  if (q.type === "multi-tf") {
    return (q.subQuestions ?? []).find((s) => s.competencyId)?.competencyId ?? null;
  }
  if (q.type === "mcq-multi" || q.type === "mcq-single") {
    return (q.options ?? []).find((o) => o.competencyId)?.competencyId ?? null;
  }
  return null;
}

export interface YccdResolvers {
  /** outcome competencyId → its parent topic competencyId. */
  topicOf: Record<string, string>;
  /** outcome competencyId → its Bloom level (fallback when q.bloomLevel unset). */
  bloomOf: Record<string, BloomLevel>;
}

/** Resolve a question's matrix placement, or null if it can't be placed. */
export function placementOf(
  q: Question,
  parts: YccdPart[],
  r: YccdResolvers,
): { topicId: string; partId: string; bloom: BloomLevel } | null {
  const partId = partIdForType(parts, q.type);
  if (!partId) return null;
  const oc = primaryOutcome(q);
  if (!oc) return null;
  const topicId = r.topicOf[oc];
  if (!topicId) return null;
  const bloom = (q.bloomLevel ?? r.bloomOf[oc]) as BloomLevel | undefined;
  if (!bloom) return null;
  return { topicId, partId, bloom };
}

export function cellKey(
  topicId: string,
  partId: string,
  bloom: number,
): string {
  return `${topicId}|${partId}|${bloom}`;
}

export interface YccdDrawInput {
  pool: Question[];
  matrix: YccdMatrix;
  resolvers: YccdResolvers;
  n: number;
  exclude?: Set<string>;
  seed?: number;
  orderStrategy?: ExamOrderStrategy;
}

/** Bucket pool ids by cellKey (constant across variants). */
function bucketPool(
  pool: Question[],
  parts: YccdPart[],
  r: YccdResolvers,
): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const q of pool) {
    const pl = placementOf(q, parts, r);
    if (!pl) continue;
    const k = cellKey(pl.topicId, pl.partId, pl.bloom);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(q.id);
  }
  return buckets;
}

export function generateYccdExams(input: YccdDrawInput): DraftExam[] {
  const {
    pool,
    matrix,
    resolvers,
    n,
    exclude,
    seed,
    orderStrategy = "shuffle-all",
  } = input;
  const byId = new Map(pool.map((q) => [q.id, q] as const));
  const contentOf = makeContentOf(byId);
  const buckets = bucketPool(pool, matrix.parts, resolvers);
  const baseSeed = seed ?? Date.now();

  const exams: DraftExam[] = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(baseSeed + i);
    const taken = new Set<string>(exclude ?? []);
    const takenContent = new Set<string>();

    // Draw each cell; collect per part so sections group by phần.
    const byPart = new Map<string, string[]>();
    for (const cell of matrix.cells) {
      if (cell.count <= 0) continue;
      const k = cellKey(cell.topicId, cell.partId, cell.bloom);
      const drawn = drawN(
        buckets.get(k) ?? [],
        cell.count,
        taken,
        takenContent,
        contentOf,
        rng,
      );
      if (drawn.length === 0) continue;
      const prev = byPart.get(cell.partId) ?? [];
      byPart.set(cell.partId, [...prev, ...drawn]);
    }

    const sections: DraftSection[] = [];
    for (const part of matrix.parts) {
      const ids = byPart.get(part.id);
      if (!ids || ids.length === 0) continue;
      sections.push({
        topicId: part.id,
        name: part.label,
        questionIds: shuffle(ids, rng),
      });
    }

    const grouped = sections.flatMap((s) => s.questionIds);
    const questionIds =
      orderStrategy === "shuffle-all" ? shuffle(grouped, rng) : grouped;
    exams.push({ questionIds, sections });
  }
  return exams;
}

// ───────────────────────── validation / invariants ──────────────────────
export interface YccdShortfall {
  topicId: string;
  partId: string;
  bloom: BloomLevel;
  need: number;
  have: number;
}

/** Pre-draw gate: every cell count ≤ inventory (keyed by cellKey). */
export function validateYccdMatrix(
  cells: YccdMatrixCell[],
  inventory: Record<string, number>,
): { ok: boolean; exceeded: YccdShortfall[] } {
  const exceeded: YccdShortfall[] = [];
  for (const c of cells) {
    if (c.count <= 0) continue;
    const have = inventory[cellKey(c.topicId, c.partId, c.bloom)] ?? 0;
    if (c.count > have) {
      exceeded.push({
        topicId: c.topicId,
        partId: c.partId,
        bloom: c.bloom,
        need: c.count,
        have,
      });
    }
  }
  return { ok: exceeded.length === 0, exceeded };
}

/** Post-draw check: every variant delivers each cell's count. */
export function checkYccdInvariants(
  drafts: DraftExam[],
  matrix: YccdMatrix,
  byId: Map<string, Question>,
  resolvers: YccdResolvers,
): { ok: boolean; shortfalls: Array<YccdShortfall & { variant: number }> } {
  const shortfalls: Array<YccdShortfall & { variant: number }> = [];
  drafts.forEach((draft, vi) => {
    const counts = new Map<string, number>();
    for (const qid of draft.questionIds) {
      const q = byId.get(qid);
      if (!q) continue;
      const pl = placementOf(q, matrix.parts, resolvers);
      if (!pl) continue;
      const k = cellKey(pl.topicId, pl.partId, pl.bloom);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const c of matrix.cells) {
      if (c.count <= 0) continue;
      const k = cellKey(c.topicId, c.partId, c.bloom);
      const have = counts.get(k) ?? 0;
      if (have < c.count) {
        shortfalls.push({
          variant: vi,
          topicId: c.topicId,
          partId: c.partId,
          bloom: c.bloom,
          need: c.count,
          have,
        });
      }
    }
  });
  return { ok: shortfalls.length === 0, shortfalls };
}

export { normContent };
