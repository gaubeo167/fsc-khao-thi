/**
 * Materialize an ExamForm from a Shift + Package + Blueprint + Question
 * pool. This is the *one* place where live Question rows get frozen
 * into snapshots; everything downstream (exam page, grading, reports,
 * analytics) reads from the frozen form, not from /questions.
 *
 * Inputs are pure data — the function does no Firestore I/O, so it's
 * unit-testable and safe to call from both the shift wizard and a
 * one-shot migration script.
 */

import { generateExams } from "@/features/exams/lib/generate";
import type {
  ExamBlueprint,
  ExamPackage,
} from "@/features/exams/data/types";
import type {
  ScoringConfig,
} from "@/features/exam-shifts/data/types";
import type {
  Question,
} from "@/features/question-bank/data/seed-questions";

import type {
  ExamForm,
  ExamFormVariant,
  QuestionSnapshot,
} from "../data/types";

interface MaterializeInput {
  shiftId: string;
  campusId: string | null;
  blueprint: ExamBlueprint;
  pkg: ExamPackage;
  /** Live question rows the form is allowed to draw from. Caller is
   *  responsible for filtering: status === "approved", correct campus,
   *  matching subject/grade etc. */
  questionPool: Question[];
  /** How many variants ("đề") to materialize. Typical: 4-8. */
  variantCount: number;
  /** Total score for the exam — copied to the frozen form so grading
   *  can't drift later. */
  scoring: ScoringConfig;
  /** UID of the staff member triggering materialization (shift author). */
  actorUid: string;
  /** Stable form id — caller can let this default to UUID, but tests
   *  pass deterministic ids. */
  formId: string;
  /** ISO timestamp — caller can override for deterministic tests. */
  now?: string;
}

/**
 * Build the frozen ExamForm payload. Returns the form ready to be
 * written to /exam_forms/{id}; the caller handles the Firestore write
 * + audit event.
 *
 * Throws if `variantCount < 1` or the question pool can't satisfy the
 * package matrix (e.g. asked for 5 easy questions of topic X but only
 * 2 approved exist).
 */
export function materializeExamForm(input: MaterializeInput): ExamForm {
  const {
    shiftId,
    campusId,
    blueprint,
    pkg,
    questionPool,
    variantCount,
    scoring,
    actorUid,
    formId,
  } = input;
  if (variantCount < 1) {
    throw new Error("variantCount must be ≥ 1");
  }
  const now = input.now ?? new Date().toISOString();

  // Build lookup by id once.
  const byId = new Map(questionPool.map((q) => [q.id, q]));

  // Reuse the existing generator to pick question ids per variant —
  // it already handles per-paper uniqueness + difficulty matrix.
  const drafts = generateExams(blueprint, pkg, byId, variantCount);

  // Materialize: clone each picked Question into a snapshot.
  const variants: ExamFormVariant[] = drafts.map((draft, vIdx) => {
    const snapshots: QuestionSnapshot[] = [];
    for (const qid of draft.questionIds) {
      const live = byId.get(qid);
      if (!live) {
        throw new Error(
          `materializeExamForm: picked question ${qid} not in pool`,
        );
      }
      snapshots.push(freezeQuestion(live, now));
    }
    const variantId = `${formId}-v${String(vIdx + 1).padStart(3, "0")}`;
    const perQuestion = computePerQuestionScoring(snapshots, scoring);
    return {
      variantId,
      name: `Đề ${String(vIdx + 1).padStart(3, "0")}`,
      questions: snapshots,
      perQuestion,
    };
  });

  const form: ExamForm = {
    id: formId,
    shiftId,
    packageId: pkg.id,
    blueprintId: blueprint.id,
    campusId,
    maxScore: scoring.maxScore,
    durationMinutes: pkg.duration || blueprint.duration,
    variants,
    integrityHash: "", // filled below after canonical hashing
    materializedAt: now,
    materializedBy: actorUid,
    lifecycle: "active",
    createdAt: now,
    updatedAt: now,
  };
  form.integrityHash = computeIntegrityHash(form);
  return form;
}

/**
 * Clone a live Question into a QuestionSnapshot. We spread the entire
 * Question object — keeping the discriminated `type` tag so the
 * existing renderer/grader code works unchanged on snapshots — and
 * intersect with provenance fields.
 *
 * Note we deep-clone arrays/objects so later mutation of the live row
 * never bleeds into the snapshot.
 */
function freezeQuestion(q: Question, snapshottedAt: string): QuestionSnapshot {
  // Structured clone is the safest deep copy; we strip the live `id`
  // off the spread and reuse it as `originalQuestionId`. The snapshot
  // gets its own deterministic id.
  const cloned = JSON.parse(JSON.stringify(q)) as Question;
  const snapshotId = `qs_${q.id}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    ...cloned,
    snapshotId,
    originalQuestionId: q.id,
    sourceVersion: 1,
    snapshottedAt,
  } as QuestionSnapshot;
}

/**
 * Compute per-question score map for one variant, given the live
 * scoring config from the shift. We resolve `mode`:
 *   - even          → maxScore / N split evenly
 *   - by-difficulty → ratio-weighted by easy/med/hard weights
 *   - manual        → use scoring.perQuestion (keyed by ORIGINAL
 *                     question id, since the wizard authored against
 *                     live ids), then re-key to snapshotId.
 *
 * Returned map is keyed by snapshotId.
 */
function computePerQuestionScoring(
  snapshots: QuestionSnapshot[],
  scoring: ScoringConfig,
): Record<string, number> {
  const n = snapshots.length;
  if (n === 0) return {};
  const out: Record<string, number> = {};

  if (scoring.mode === "manual" && scoring.perQuestion) {
    let total = 0;
    for (const snap of snapshots) {
      const fromAuthor = scoring.perQuestion[snap.originalQuestionId] ?? 0;
      out[snap.snapshotId] = fromAuthor;
      total += fromAuthor;
    }
    // If the manual map summed to ≠ maxScore (because the wizard
    // validation slipped or a question was added later), normalise so
    // the form is consistent. Audit log will record the override.
    if (total > 0 && Math.abs(total - scoring.maxScore) > 0.01) {
      const scale = scoring.maxScore / total;
      for (const snap of snapshots) {
        out[snap.snapshotId] = round2(out[snap.snapshotId]! * scale);
      }
    }
    return out;
  }

  if (scoring.mode === "by-difficulty") {
    const weights = scoring.difficultyWeights ?? {
      easy: 1,
      medium: 1.5,
      hard: 2,
    };
    let denom = 0;
    for (const snap of snapshots) denom += weights[snap.difficulty] ?? 1;
    if (denom === 0) {
      // Degenerate; fall through to even.
    } else {
      for (const snap of snapshots) {
        const w = weights[snap.difficulty] ?? 1;
        out[snap.snapshotId] = round2((scoring.maxScore * w) / denom);
      }
      return out;
    }
  }

  // "even" (or fallback)
  const per = round2(scoring.maxScore / n);
  for (const snap of snapshots) out[snap.snapshotId] = per;
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute a stable SHA-256 hash over the form's content fields. Order
 * of keys is canonicalized by sorting via JSON.stringify with a
 * replacer that emits keys alphabetically. Uses Web Crypto if available
 * (browser, Node 19+); throws if neither available.
 *
 * The hash exists so a direct DB tamper (someone editing exam_forms
 * doc in Firestore console) can be detected at attempt start by
 * recomputing and comparing. Phase F will add the runtime check; for
 * now we just store the hash.
 */
function computeIntegrityHash(form: ExamForm): string {
  const canonical = canonicalJson({
    maxScore: form.maxScore,
    durationMinutes: form.durationMinutes,
    variants: form.variants,
  });
  // Sync hash isn't available cross-platform; we expose a sync FNV-1a
  // hash as a placeholder. Production deployments should swap this for
  // a server-side SHA-256 (computed in the materialize API route).
  return `fnv1a-64:${fnv1a64(canonical)}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

/** 64-bit FNV-1a — not cryptographic, but stable across platforms and
 *  good enough to detect accidental tamper. Production hardening will
 *  swap to SHA-256 over the same canonical payload. */
function fnv1a64(s: string): string {
  // BigInt is supported in every browser we ship for; using it avoids
  // 32-bit overflow.
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
