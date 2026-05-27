/**
 * Homework (Bài tập về nhà — BTVN).
 *
 * Differs from /shifts in three important ways:
 *   1. No per-attempt timer. Student starts and submits whenever they
 *      want within [assignedAt, dueAt]. Progress is auto-saved.
 *   2. Day-granular dates (no hour:minute). assignedAt = ngày mở,
 *      dueAt = ngày hết hạn (cuối ngày).
 *   3. Scoring is plain correct-count, not weighted points. Each
 *      auto-gradable question is 1 mark; sum / total = the report.
 *
 * Attached materials (`materialIds`) show in a sidebar while the
 * student answers, so they can re-read the lesson while working.
 */

import type { Answer } from "@/features/shift-exam/state/attempts-store";

export type HomeworkStatus = "draft" | "published" | "closed";

export interface Homework {
  id: string;

  title: string;
  description?: string;

  /** Subject / grade for filtering + scope checks. */
  subjectId: string;
  gradeId: string | null;
  /** Which classes can see this homework. Student membership in any
   *  class here grants access. */
  classIds: string[];
  /** Optional per-student override. When non-empty, ONLY these
   *  students can see / submit the homework — class membership alone
   *  is not enough. When empty / undefined, every student in any of
   *  the listed classes is included (legacy + default). */
  studentIds?: string[];

  /** Frozen list of question ids — references /questions. The
   *  question content is intentionally NOT snapshotted (Phase A only
   *  snapshots exam content); for homework, integrity-grade audit is
   *  not required. Teachers should not edit questions after assigning. */
  questionIds: string[];

  /** Optional learning material attachments shown alongside the
   *  question runtime. */
  materialIds: string[];

  /** ISO date (no time) — the homework opens at 00:00 local on this day. */
  assignedAt: string;
  /** ISO date — the homework closes at 23:59 local on this day. After
   *  closure, students can no longer submit (existing attempts stay
   *  readable for stats). */
  dueAt: string;

  campusId: string | null;
  ownerId: string;
  ownerName: string;
  status: HomeworkStatus;

  /** Soft-delete bookkeeping (see lib/lifecycle.ts). */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Per-student attempt at a homework. Created lazily when the student
 * first opens the homework page. `answers` is updated incrementally
 * as the student types — no separate "save" button.
 */
export interface HomeworkAttempt {
  id: string;
  homeworkId: string;
  studentId: string;
  campusId?: string | null;

  /** questionId → answer payload. Same shape as exam attempts. */
  answers: Record<string, Answer>;
  /** questionIds the student flagged to revisit. */
  markedForReview: string[];

  startedAt: string;
  /** Null while in-progress. Set on submit; can't be modified after. */
  submittedAt: string | null;

  /** Filled at submit time. */
  correctCount: number | null;
  totalQuestions: number | null;
}

/**
 * Auto-gradable question types. Homework can ONLY include these —
 * essay/AI-generated are excluded because BTVN scoring is plain
 * correct/wrong count, not rubric-based.
 */
export const HOMEWORK_QUESTION_TYPES = new Set([
  "mcq-single",
  "mcq-multi",
  "true-false",
  "multi-tf",
  "short-answer",
  "fill-blank",
  "matching",
  "ordering",
  "drag-drop",
  "underline",
]);

/** Whether a date string represents today-or-future at day granularity. */
export function isHomeworkOpen(
  homework: Pick<Homework, "assignedAt" | "dueAt" | "status">,
  now: number = Date.now(),
): boolean {
  if (homework.status !== "published") return false;
  const startMs = new Date(homework.assignedAt + "T00:00:00").getTime();
  const endMs = new Date(homework.dueAt + "T23:59:59").getTime();
  return now >= startMs && now <= endMs;
}

/** Effective state (derived from clock + stored status) for badges. */
export function effectiveHomeworkState(
  homework: Pick<Homework, "assignedAt" | "dueAt" | "status">,
  now: number = Date.now(),
): "draft" | "scheduled" | "open" | "closed" {
  if (homework.status === "draft") return "draft";
  if (homework.status === "closed") return "closed";
  const startMs = new Date(homework.assignedAt + "T00:00:00").getTime();
  const endMs = new Date(homework.dueAt + "T23:59:59").getTime();
  if (now < startMs) return "scheduled";
  if (now > endMs) return "closed";
  return "open";
}
