/**
 * YCCĐ-based exam generation — a parallel to `generate.ts`, drawing by
 * (outcome × question-type) instead of (mạch × difficulty). Produces the same
 * `DraftExam` shape so it flows through the existing preview (`addBatch`) and
 * runtime (`materializeExamForm`) bridges unchanged.
 *
 * Determinism: seeded via mulberry32 so "N mã đề khớp ma trận" is reproducible
 * and unit-testable. Uniqueness (câu-level) is guaranteed by the shared
 * `taken` / `takenContent` sets across every outcome + type in one paper.
 */
import type { QuestionType } from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { ExamOrderStrategy } from "@/features/exam-forms/data/types";

import type { YccdMatrixRow, YccdType } from "../data/types";

import {
  drawN,
  makeContentOf,
  mulberry32,
  normContent,
  shuffle,
  type DraftExam,
  type DraftSection,
} from "./generate";

/** Map a QuestionType → its MOET matrix bucket (null = not a YCCĐ-matrix type). */
export function yccdTypeOf(t: QuestionType): YccdType | null {
  switch (t) {
    case "mcq-single":
    case "true-false":
      return "mcq";
    case "mcq-multi":
      return "mcqMulti";
    case "multi-tf":
      return "ds";
    case "essay":
    case "ai-generated":
    case "short-answer":
      return "tl";
    default:
      return null; // fill-blank / matching / ordering / drag-drop / underline
  }
}

/** Does a question assess `outcomeId` — at question level, per-ý (multi-tf),
 *  or per-option (mcq)? */
export function questionHitsOutcome(q: Question, outcomeId: string): boolean {
  if (q.competencyIds?.includes(outcomeId)) return true;
  if (q.type === "multi-tf") {
    return (q.subQuestions ?? []).some((s) => s.competencyId === outcomeId);
  }
  if (q.type === "mcq-multi" || q.type === "mcq-single") {
    return (q.options ?? []).some((o) => o.competencyId === outcomeId);
  }
  return false;
}

export interface YccdDrawInput {
  /** Candidate pool (already filtered: approved, !archived, subject+grade). */
  pool: Question[];
  matrix: YccdMatrixRow[];
  /** Number of variants (mã đề). */
  n: number;
  /** Ids never drawn (teacher un-ticked in step ②). */
  exclude?: Set<string>;
  /** Deterministic seed; each variant uses seed+i. */
  seed?: number;
  orderStrategy?: ExamOrderStrategy;
  /** Optional display name per outcome for the section label. */
  labelOf?: (competencyId: string) => string;
}

type Buckets = Map<string, Record<YccdType, string[]>>;

function bucketByOutcomeType(pool: Question[], matrix: YccdMatrixRow[]): Buckets {
  const buckets: Buckets = new Map();
  for (const row of matrix) {
    if (buckets.has(row.competencyId)) continue;
    const rec: Record<YccdType, string[]> = {
      mcq: [],
      mcqMulti: [],
      ds: [],
      tl: [],
    };
    for (const q of pool) {
      if (!questionHitsOutcome(q, row.competencyId)) continue;
      const t = yccdTypeOf(q.type);
      if (t) rec[t].push(q.id);
    }
    buckets.set(row.competencyId, rec);
  }
  return buckets;
}

export function generateYccdExams(input: YccdDrawInput): DraftExam[] {
  const {
    pool,
    matrix,
    n,
    exclude,
    seed,
    orderStrategy = "shuffle-all",
    labelOf,
  } = input;
  const byId = new Map(pool.map((q) => [q.id, q] as const));
  const contentOf = makeContentOf(byId);
  const buckets = bucketByOutcomeType(pool, matrix);
  const baseSeed = seed ?? Date.now();

  const exams: DraftExam[] = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(baseSeed + i);
    // Shared across the whole paper → cross-outcome & cross-type uniqueness.
    const taken = new Set<string>(exclude ?? []);
    const takenContent = new Set<string>();

    const sections: DraftSection[] = [];
    for (const row of matrix) {
      const b = buckets.get(row.competencyId);
      if (!b) continue;
      const drawn: string[] = [
        ...drawN(b.mcq, row.mcqCount, taken, takenContent, contentOf, rng),
        ...drawN(b.mcqMulti, row.mcqMultiCount, taken, takenContent, contentOf, rng),
        ...drawN(b.ds, row.dsCount, taken, takenContent, contentOf, rng),
        ...drawN(b.tl, row.tlCount, taken, takenContent, contentOf, rng),
      ];
      if (drawn.length === 0) continue;
      sections.push({
        topicId: row.competencyId,
        name: labelOf?.(row.competencyId) ?? row.competencyId,
        questionIds: shuffle(drawn, rng),
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
  competencyId: string;
  type: YccdType;
  need: number;
  have: number;
}

/** Pre-draw gate: every matrix count must be ≤ inventory (content-deduped). */
export function validateYccdMatrix(
  matrix: YccdMatrixRow[],
  inventory: Record<string, Record<YccdType, number>>,
): { ok: boolean; exceeded: YccdShortfall[] } {
  const exceeded: YccdShortfall[] = [];
  for (const row of matrix) {
    const inv = inventory[row.competencyId] ?? { mcq: 0, mcqMulti: 0, ds: 0, tl: 0 };
    const checks: Array<[YccdType, number]> = [
      ["mcq", row.mcqCount],
      ["mcqMulti", row.mcqMultiCount],
      ["ds", row.dsCount],
      ["tl", row.tlCount],
    ];
    for (const [type, need] of checks) {
      if (need > inv[type]) {
        exceeded.push({ competencyId: row.competencyId, type, need, have: inv[type] });
      }
    }
  }
  return { ok: exceeded.length === 0, exceeded };
}

/** Post-draw check: every variant's per-outcome per-type counts match the
 *  matrix. `drawN` under-delivers silently, so this catches shortfalls. */
export function checkYccdInvariants(
  drafts: DraftExam[],
  matrix: YccdMatrixRow[],
  byId: Map<string, Question>,
): { ok: boolean; shortfalls: Array<YccdShortfall & { variant: number }> } {
  const shortfalls: Array<YccdShortfall & { variant: number }> = [];
  drafts.forEach((draft, vi) => {
    for (const row of matrix) {
      const sec = draft.sections.find((s) => s.topicId === row.competencyId);
      const counts: Record<YccdType, number> = { mcq: 0, mcqMulti: 0, ds: 0, tl: 0 };
      for (const qid of sec?.questionIds ?? []) {
        const t = yccdTypeOf(byId.get(qid)?.type ?? ("" as QuestionType));
        if (t) counts[t]++;
      }
      const need: Array<[YccdType, number]> = [
        ["mcq", row.mcqCount],
        ["mcqMulti", row.mcqMultiCount],
        ["ds", row.dsCount],
        ["tl", row.tlCount],
      ];
      for (const [type, want] of need) {
        if (counts[type] < want) {
          shortfalls.push({
            variant: vi,
            competencyId: row.competencyId,
            type,
            need: want,
            have: counts[type],
          });
        }
      }
    }
  });
  return { ok: shortfalls.length === 0, shortfalls };
}

export { normContent };
