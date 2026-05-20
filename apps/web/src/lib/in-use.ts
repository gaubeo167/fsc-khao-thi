/**
 * Centralised "is X in use?" predicates for the enterprise data
 * integrity rules. Every place that wants to archive/edit a production
 * entity routes through these so the rules stay consistent.
 *
 * Reference chain (downstream → upstream):
 *   attempts → exam_forms → variants → question snapshots
 *                                ↑
 *                                shifts → packages → blueprints → questions
 *
 * "In use" means a non-archived downstream row references the entity.
 * Archived downstream rows don't count — they're frozen historical
 * evidence, not active references that would break.
 */

import type { ExamForm } from "@/features/exam-forms/data/types";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import type {
  ExamBlueprint,
  ExamPackage,
} from "@/features/exams/data/types";
import type { StudentAttempt } from "@/features/shift-exam/state/attempts-store";
import { isLive } from "@/lib/lifecycle";

export interface InUseResult {
  inUse: boolean;
  /** Short human message explaining which entities are blocking, used
   *  as the dialog description. */
  reason?: string;
  /** Names / labels of blocking entities (max 5) shown in a list. */
  blockers?: string[];
}

/** A question is in use if any active exam_form contains a snapshot of
 *  it. ExamForm uses its own `lifecycle` field (not archivedAt) since
 *  it pre-dates the Phase C unification — both shapes are honored. */
export function questionInUse(
  questionId: string,
  examForms: ExamForm[],
): InUseResult {
  const blockingForms = examForms.filter(
    (f) =>
      f.lifecycle === "active" &&
      f.variants.some((v) =>
        v.questions.some((q) => q.originalQuestionId === questionId),
      ),
  );
  if (blockingForms.length === 0) return { inUse: false };
  return {
    inUse: true,
    reason: `Câu hỏi đang được dùng trong ${blockingForms.length} đề thi đã đóng băng.`,
    blockers: blockingForms.slice(0, 5).map((f) => f.id),
  };
}

/** A blueprint is in use if any non-archived package references it. */
export function blueprintInUse(
  blueprintId: string,
  packages: ExamPackage[],
): InUseResult {
  const blocking = packages.filter(
    (p) => isLive(p) && p.blueprintId === blueprintId,
  );
  if (blocking.length === 0) return { inUse: false };
  return {
    inUse: true,
    reason: `Khung đề đang được dùng bởi ${blocking.length} gói đề.`,
    blockers: blocking.slice(0, 5).map((p) => p.name),
  };
}

/** A package is in use if any non-archived shift references it. */
export function packageInUse(
  packageId: string,
  shifts: ExamShift[],
): InUseResult {
  const blocking = shifts.filter(
    (s) => isLive(s) && s.packageId === packageId,
  );
  if (blocking.length === 0) return { inUse: false };
  return {
    inUse: true,
    reason: `Gói đề đang được dùng trong ${blocking.length} ca thi.`,
    blockers: blocking.slice(0, 5).map((s) => s.name),
  };
}

/** A shift is in use if ANY attempt exists for it (even archived
 *  attempts count — once a student opened the shift, the historical
 *  record locks the shift's content). */
export function shiftInUse(
  shiftId: string,
  attempts: StudentAttempt[],
): InUseResult {
  const blocking = attempts.filter((a) => a.shiftId === shiftId);
  if (blocking.length === 0) return { inUse: false };
  const submitted = blocking.filter((a) => a.submittedAt != null).length;
  return {
    inUse: true,
    reason: `Ca thi đã có ${blocking.length} lượt làm bài (${submitted} đã nộp). Dữ liệu thi của HS không được phép xoá để bảo toàn minh chứng / kết quả.`,
    blockers: blocking
      .slice(0, 5)
      .map((a) => `${a.studentId}${a.submittedAt ? " (đã nộp)" : ""}`),
  };
}

/**
 * Standard message shown when an entity is locked. Caller plugs the
 * specific reason into the second sentence.
 *
 * Per the enterprise UX spec (see USER prompt): NO silent disable. The
 * dialog or button area must explain WHY and offer the alternative.
 */
export function buildLockedMessage(result: InUseResult): string {
  return [
    "Bộ này đã được sử dụng trong kỳ thi thực tế.",
    "Để đảm bảo tính toàn vẹn dữ liệu và audit compliance, hệ thống không cho phép xoá / chỉnh sửa trực tiếp.",
    result.reason ?? "",
    "Vui lòng tạo phiên bản mới.",
  ]
    .filter(Boolean)
    .join(" ");
}
