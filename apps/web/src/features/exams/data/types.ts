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
import type { QuestionType } from "@/features/question-bank/data/question-types";

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
/**
 * A configurable exam PART (cấu phần) — one column-group of the MOET matrix.
 * THPT typically has all 4 (Nhiều lựa chọn / Đúng–Sai / Trả lời ngắn / Tự
 * luận); other subjects or levels may use only 2–3. The teacher picks which
 * parts their exam has; the matrix + structure only show the selected parts.
 */
export interface YccdPart {
  id: string;
  label: string;
  /** QuestionTypes this part draws from (parts should partition the types). */
  questionTypes: QuestionType[];
  /** Điểm mỗi câu của phần (bước ④). */
  pointsPerQuestion?: number;
}

/** MOET default parts (THPT). Teacher enables a subset + can rename. */
export const MOET_DEFAULT_PARTS: YccdPart[] = [
  { id: "mcq", label: "Trắc nghiệm nhiều lựa chọn", questionTypes: ["mcq-single", "mcq-multi"] },
  { id: "ds", label: "Trắc nghiệm Đúng – Sai", questionTypes: ["multi-tf"] },
  { id: "short", label: "Trắc nghiệm trả lời ngắn", questionTypes: ["short-answer"] },
  { id: "tl", label: "Tự luận", questionTypes: ["essay", "ai-generated"] },
];

/** One cell of the MOET matrix: số câu cần bốc cho (Bài × phần × mức Bloom).
 *  Sparse — thiếu cell = 0. */
export interface YccdMatrixCell {
  /** Competency.id (kind === "topic") — the Bài/Chủ đề row. */
  topicId: string;
  /** YccdPart.id — the question-type column group. */
  partId: string;
  /** 1=Biết, 2=Hiểu, 3=Vận dụng — the sub-column. */
  bloom: BloomLevel;
  count: number;
}

/** The full MOET matrix stored on the package. */
export interface YccdMatrix {
  /** Selected parts (configurable, ordered). */
  parts: YccdPart[];
  /** Selected topic (Bài) rows, ordered; each carries its chapter for grouping. */
  rows: { topicId: string; chapterId: string | null }[];
  /** Sparse cell counts. */
  cells: YccdMatrixCell[];
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

/**
 * Reusable exam-structure config per Môn + Khối (bước ④). Tên phần + dạng
 * câu trong mỗi phần + điểm/câu + cách chấm + thứ tự + thời gian. Tự nạp lại
 * vào wizard lần sau; đề sinh ra vẫn gắn kèm bản sao (yccdMatrix.parts +
 * scoringPolicy) để ca thi khoá theo cài đặt. Doc id = `${subjectId}__${gradeId}`.
 */
export interface ExamPartConfig {
  id: string;
  subjectId: string;
  gradeId: string;
  /** Các phần (Phần I/II/…) — label + questionTypes + pointsPerQuestion. */
  parts: YccdPart[];
  mcqMulti: "full" | "partial";
  ds: "graduated" | "weighted" | "full";
  dsGraduatedTable?: Record<number, number>;
  orderStrategy: "by-section" | "shuffle-all";
  durationMinutes: number;
  updatedAt: string;
  updatedBy?: string;
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
   * by (Bài × phần × Bloom) instead of mạch/độ-khó (mirrors the `cpCounts`
   * switch). When set, `matrix` may be empty. Additive & optional — legacy
   * packages are untouched.
   */
  yccdMatrix?: YccdMatrix;
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

/** An ExamPackage created by the YCCĐ wizard (has a MOET matrix). */
export type YccdPackage = ExamPackage & {
  yccdMatrix: YccdMatrix;
  scoringPolicy: ScoringPolicy;
};

export function isYccdPackage(p: ExamPackage): p is YccdPackage {
  return !!p.yccdMatrix && p.yccdMatrix.cells.length > 0;
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
