/**
 * Exam Form (đề thi materialized) — the frozen, immutable rendering of
 * a shift's exam content at the moment the shift is created/published.
 *
 * Why this exists:
 *   Until now, the exam page resolved questions LIVE from
 *   `bp.topics.pickedQuestionIds` → `/questions/{id}`. That meant a
 *   teacher editing a question in the bank changed what students were
 *   seeing mid-exam, AND retroactively rewrote what already-finished
 *   students "had been asked". This violates the enterprise integrity
 *   principle: historical exam integrity > edit convenience.
 *
 * What a Form holds:
 *   - One or more variants ("đề") — each a deterministic shuffle of
 *     the package's selected questions.
 *   - For each variant: a list of QuestionSnapshot rows. Each snapshot
 *     is a full copy of the Question at materialization time (content,
 *     options, correctAnswer, etc.), so future edits to the bank do
 *     not propagate.
 *   - Per-question scoring frozen.
 *   - SHA-256 integrity hash over canonical JSON of variants+scoring,
 *     so any direct DB tamper is detectable.
 *
 * Lifecycle:
 *   active → archived (never hard-deleted; analytics + audit depend on
 *   it staying queryable forever).
 */

import type { Question } from "@/features/question-bank/data/seed-questions";

/**
 * Snapshot of a single Question row, frozen at materialization. We keep
 * the discriminated Question union intact (so renderer + grader code
 * keeps working) and intersect with provenance fields.
 */
export type QuestionSnapshot = Question & {
  /** UUID for THIS snapshot row (different per (form, variant) pair). */
  snapshotId: string;
  /** Original /questions/{id} this was cloned from. Kept for audit
   *  but never followed at render time. */
  originalQuestionId: string;
  /** Version number of the source question at snapshot time. For the
   *  current MVP this is always 1 (Phase D introduces real version
   *  chains); kept now to avoid a migration later. */
  sourceVersion: number;
  /** When this snapshot was frozen. */
  snapshottedAt: string;
};

export interface ExamFormVariant {
  /** UUID for this variant within the form. Used by attempts to pin
   *  which đề a given student received. */
  variantId: string;
  /** Display name — "Đề 001", "Đề 002", … */
  name: string;
  /** Ordered question snapshots for this variant. */
  questions: QuestionSnapshot[];
  /** Frozen per-question score map — keyed by snapshotId. Sum must
   *  equal `ExamForm.maxScore`. Source of truth for grading; the
   *  live ShiftScoring.perQuestion on the shift doc is the *authoring*
   *  representation and may diverge once the form is frozen. */
  perQuestion: Record<string, number>;
}

export type ExamFormLifecycle = "active" | "archived";

export interface ExamForm {
  /** UUID — distinct from the shift id. One shift = one form initially;
   *  if the package is republished, a new form is created and the old
   *  one moves to "archived". */
  id: string;
  /** Owning shift. Reverse lookup: query exam_forms where shiftId == X
   *  AND lifecycle == "active". */
  shiftId: string;
  /** Frozen pointer to the package this form was materialized from. */
  packageId: string;
  /** Frozen pointer to the blueprint. */
  blueprintId: string;
  /** Campus this form belongs to — copied from shift for tenant isolation
   *  and rules-friendliness. */
  campusId: string | null;

  /** Total possible score, copied from shift.scoring.maxScore at
   *  materialization. Per-question splits live in each variant's
   *  perQuestion map. */
  maxScore: number;
  /** Duration (minutes) copied from package/blueprint at freeze time. */
  durationMinutes: number;

  variants: ExamFormVariant[];

  /** SHA-256 hex of `JSON.stringify({maxScore, durationMinutes, variants})`
   *  using a stable key ordering. Any direct DB tamper changes this
   *  hash; runtime can detect a forged form by recomputing. */
  integrityHash: string;

  materializedAt: string;
  materializedBy: string;

  lifecycle: ExamFormLifecycle;

  createdAt: string;
  updatedAt: string;
}

/**
 * Pick the variant a given student should receive, deterministically.
 * Same input → same variant, so a refresh doesn't switch đề.
 *
 * Pure function; safe to call on both server and client.
 */
export function pickVariantForStudent(
  form: ExamForm,
  studentUid: string,
): ExamFormVariant | null {
  if (form.variants.length === 0) return null;
  const key = `${form.id}|${studentUid}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % form.variants.length;
  return form.variants[idx] ?? null;
}
