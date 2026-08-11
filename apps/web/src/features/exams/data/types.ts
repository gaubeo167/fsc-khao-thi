/**
 * Exam management data model — covers the 3 stages:
 *   1. ExamBlueprint  (Khung đề)     — define mạch kiến thức + pick question pool
 *   2. ExamPackage    (Gói đề)       — define matrix (count by difficulty per mạch)
 *   3. GeneratedExam  (Đề đã sinh)   — auto-generated exams from a package
 *
 * The lifecycle: Blueprint → Package(s) → many GeneratedExams per package,
 * each with shuffled question order. A Package's matrix counts are capped by
 * what's available in the underlying Blueprint.
 */

import type { BloomLevel } from "@/features/competencies/data/types";

export interface BlueprintTopic {
  id: string;
  /** Display name (mạch kiến thức), e.g. "Đại số" / "Hình học" */
  name: string;
  /**
   * IDs picked from the school question bank for this mạch. Must reference
   * questions in kho=campus, status=approved, matching the blueprint's
   * subjectId + gradeId.
   */
  pickedQuestionIds: string[];
}

export interface ExamBlueprint {
  id: string;
  name: string;
  subjectId: string;
  gradeId: string;
  /** Total exam duration in minutes — copied to each generated exam. */
  duration: number;

  campusId: string | null;
  ownerId: string;
  ownerName: string;

  topics: BlueprintTopic[];

  /** Soft-delete bookkeeping (see lib/lifecycle.ts). */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  /** Version chain (see lib/version.ts). */
  version?: number;
  versionOfRootId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface PackageMatrixRow {
  /** References BlueprintTopic.id within the parent's blueprint. */
  topicId: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  /**
   * Per-CP draw counts (leaf tocNode id → số câu bốc). Present when the
   * mạch's questions are organised by chủ điểm (CP). When set, the exam
   * generator draws by CP instead of by difficulty; `outsideCount` covers
   * questions not attached to any CP. Absent → legacy difficulty matrix.
   */
  cpCounts?: Record<string, number>;
  /** Số câu bốc từ nhóm "Ngoài CP" (câu chưa gắn chủ điểm). */
  outsideCount?: number;
}

// ───────────────────────── YCCĐ (competency-based) exam ─────────────────────
/** The 4 MOET question buckets a YCCĐ matrix counts by (12 QuestionType → 4). */
export type YccdType = "mcq" | "mcqMulti" | "ds" | "tl";

/** One matrix row: how many of each bucket to draw for ONE outcome (YCCĐ leaf).
 *  Counts are clamped to inventory in wizard step ③. */
export interface YccdMatrixRow {
  /** Competency.id (kind === "outcome"); also the paired BlueprintTopic.id
   *  so sections group by YCCĐ. */
  competencyId: string;
  /** Denormalised for display/audit; source of truth is the Competency doc. */
  bloomLevel?: BloomLevel | null;
  /** TN 1 đáp án + Đúng/Sai đơn (mcq-single, true-false). */
  mcqCount: number;
  /** TN nhiều đáp án (mcq-multi). */
  mcqMultiCount: number;
  /** Đúng–Sai chùm (multi-tf) — đếm THEO CHÙM (mỗi câu = 1 chùm nhiều ý). */
  dsCount: number;
  /** Tự luận / trả lời ngắn (essay, short-answer, ai-generated). */
  tlCount: number;
}

/** MOET scoring policy (Axis-B), frozen onto the package. */
export interface ScoringPolicy {
  /** MCQ nhiều đáp án: "full"=toàn phần (đúng hết mới có điểm);
   *  "partial"=từng phần max(0,(#đúng−#sai)/#đáp-án-đúng)×điểm. */
  mcqMulti: "full" | "partial";
  /** Đúng–Sai chùm: "graduated"=lũy tiến theo số ý đúng (bảng);
   *  "weighted"=trọng số mỗi ý (MultiTfSub.weight); "full"=đúng hết mới có điểm. */
  ds: "graduated" | "weighted" | "full";
  /** Bảng lũy tiến khi ds==="graduated": số ý đúng → phần điểm (0..1). */
  dsGraduatedTable?: Record<number, number>;
  /** Tổng điểm toàn đề (khuyến nghị chuẩn hoá 10). */
  maxScore: number;
}

/** MOET THPT preset for 4-ý Đúng–Sai lũy tiến. FSC preset = {1:.25,2:.5,3:.75,4:1}. */
export const DEFAULT_DS_GRADUATED: Record<number, number> = {
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0,
};

export type PackageStatus = "draft" | "pending" | "approved" | "rejected";

export interface ExamPackage {
  id: string;
  name: string;
  blueprintId: string;
  /** Override duration; if 0/undefined, falls back to the blueprint's. */
  duration: number;

  campusId: string | null;
  ownerId: string;
  ownerName: string;

  matrix: PackageMatrixRow[];

  /**
   * Present ⇒ this package was built by the YCCĐ wizard; the generator draws
   * by OUTCOME×TYPE instead of mạch/độ-khó (mirrors the `cpCounts` switch).
   * When set, `matrix` may be empty. Additive & optional — legacy packages
   * are untouched.
   */
  matrixByOutcome?: YccdMatrixRow[];
  /** MOET scoring policy (Axis-B) for YCCĐ packages; frozen into ExamForm. */
  scoringPolicy?: ScoringPolicy;

  /**
   * Approval state for using this package in exam shifts (ca kíp thi).
   *   - Packages created by a teacher start as "pending" and need approval
   *     from a campus-admin or higher before they can be assigned to a shift.
   *   - Packages created by subject-lead and above auto-enter "approved".
   *   - Editing an approved package as a teacher knocks it back to "pending".
   */
  status: PackageStatus;
  approvedBy?: string | null;
  rejectionNote?: string | null;

  /** Soft-delete bookkeeping. */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  /** Version chain (see lib/version.ts). */
  version?: number;
  versionOfRootId?: string;

  createdAt: string;
  updatedAt: string;
}

/** An ExamPackage created by the YCCĐ wizard (has an outcome matrix). */
export type YccdPackage = ExamPackage & {
  matrixByOutcome: YccdMatrixRow[];
  scoringPolicy: ScoringPolicy;
};

export function isYccdPackage(p: ExamPackage): p is YccdPackage {
  return Array.isArray(p.matrixByOutcome) && p.matrixByOutcome.length > 0;
}

export interface GeneratedExam {
  id: string;
  /** Human label shown in lists — e.g. "Đề 001", "Đề 002". */
  name: string;
  packageId: string;
  /** Shuffled order; each id references the campus question bank. */
  questionIds: string[];
  /** Duration copied from package at generation time. */
  duration: number;
  createdAt: string;
}
