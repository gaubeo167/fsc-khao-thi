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

  createdAt: string;
  updatedAt: string;
}

export interface PackageMatrixRow {
  /** References BlueprintTopic.id within the parent's blueprint. */
  topicId: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
}

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

  createdAt: string;
  updatedAt: string;
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
