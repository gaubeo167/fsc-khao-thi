/**
 * Exam shift (ca kíp thi) data model.
 *
 * A shift binds a student cohort (grade + subject + classes) to an
 * approved exam package and a scheduled time window, plus the proctoring
 * logistics (rooms + proctors) and the anti-cheat policy enforced on
 * student devices during the shift.
 *
 * Constraints worth remembering:
 *   - `packageId` must reference an `ExamPackage` with `status === "approved"`.
 *     Teacher-created packages stay in `pending` until Admin campus duyệt;
 *     the wizard filters those out at selection time.
 *   - All linked entities (subject/grade/classes/proctors) must live in
 *     the same campus as the shift.
 */

import type { ExamOrderStrategy } from "@/features/exam-forms/data/types";
import type { QuestionType } from "@/features/question-bank/data/question-types";

export type ShiftStatus =
  | "draft"
  | "scheduled"
  | "in-progress"
  | "completed"
  | "cancelled";

/**
 * Compute the *displayed* status for a shift given the current wall clock.
 * The stored `status` field is mostly authored ("draft" / "scheduled" /
 * "cancelled"); transitions between `scheduled → in-progress → completed`
 * happen as time crosses `startAt` and `endAt`. We never mutate the store
 * for these (the page rerenders on a 30s tick) — the derived value is the
 * source of truth for badges, KPIs, and filters.
 *
 * Rules:
 *   - "draft" / "cancelled" stay as-is regardless of clock.
 *   - "completed" (manual mark) stays as-is.
 *   - "scheduled" or "in-progress" → derive from `now`:
 *        now < startAt          → "scheduled"
 *        startAt ≤ now ≤ endAt  → "in-progress"
 *        now > endAt            → "completed"
 */
export function effectiveShiftStatus(
  shift: Pick<ExamShift, "status" | "startAt" | "endAt">,
  now: number = Date.now(),
): ShiftStatus {
  if (
    shift.status === "draft" ||
    shift.status === "cancelled" ||
    shift.status === "completed"
  ) {
    return shift.status;
  }
  const start = new Date(shift.startAt).getTime();
  const end = new Date(shift.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return shift.status;
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "in-progress";
}

export interface ShiftRoom {
  id: string;
  /** Free-form name as labelled in the building, e.g. "Phòng 201". */
  name: string;
  /** Hard cap on number of students this room can hold. */
  capacity: number;
  /** Classes represented in this room — derived from `studentIds`, kept
   *  alongside as a fast lookup for downstream views (legacy field). */
  classIds: string[];
  /** Explicit student-level assignment. Authoritative — `classIds` is
   *  derived from this list at write time. */
  studentIds: string[];
  /** User ids (from users-store) acting as giám thị. */
  proctorIds: string[];
}

/**
 * Order in which students are distributed across rooms when the AI
 * auto-assigner runs in Step 4 of the wizard.
 *
 *  - "alphabet" — sort by Vietnamese given name (the last word of the
 *    full name, e.g. "Nguyễn Hoàng **Lan**" sorts under L). Default —
 *    matches how class rosters are conventionally listed in VN schools.
 *  - "class"    — group by `className` first so a single room contains
 *    a contiguous slice of a single class where possible.
 *  - "random"   — shuffle, useful for mixing classes / minimising
 *    seating bias.
 */
export type RoomAssignMode = "alphabet" | "class" | "random";

/**
 * How shift-total points are distributed across questions of the exam.
 *
 *   - "even"          — every question worth `maxScore / N`
 *   - "by-difficulty" — easy / medium / hard each have a relative weight;
 *                       a question's score = `maxScore * (w_d / Σ(w_d × count_d))`
 *   - "manual"        — explicit per-question score map, sum MUST equal `maxScore`
 *   - "by-part"       — giáo viên chia đề thành các PHẦN theo DẠNG câu hỏi và
 *                       đặt TỔNG điểm cho từng phần; hệ thống chia đều tổng đó
 *                       cho số câu thực tế trong phần
 *
 * The student's final shift score is the sum of per-question scores
 * awarded (full credit for auto-graded correct, ratio of essay rubric for
 * manually-graded). Auto-graded incorrect = 0.
 */
export type ScoringMode = "even" | "by-difficulty" | "manual" | "by-part";

/**
 * Một PHẦN của đề khi chấm theo cấu trúc quen thuộc của giáo viên:
 *
 *   Phần I  — Trắc nghiệm nhiều lựa chọn   4,0 điểm
 *   Phần II — Đúng/Sai nhiều ý             4,0 điểm
 *   Phần III— Trả lời ngắn                 2,0 điểm
 *
 * Phần được xác định bằng DẠNG câu hỏi, không phải một trục của ma trận. Một
 * dạng chỉ thuộc đúng một phần; khi nhiều phần cùng khai một dạng thì phần
 * ĐỨNG TRƯỚC thắng (xem `partIdForType`).
 *
 * `points` là TỔNG điểm của cả phần, không phải điểm mỗi câu. Chia cho số câu
 * thực tế bốc được, nên giáo viên không phải tính tay khi số câu thay đổi.
 */
export interface ScorePart {
  id: string;
  label: string;
  questionTypes: QuestionType[];
  /** TỔNG điểm của cả phần. Σ points của mọi phần phải bằng `maxScore`. */
  points: number;
}

export interface ScoringConfig {
  /** Total possible score for this exam — typically 10 (VN standard) or 100. */
  maxScore: number;
  mode: ScoringMode;
  /** Relative weights when `mode === "by-difficulty"`. Treated as ratios;
   *  the renderer normalises so per-question sums match `maxScore`. */
  difficultyWeights?: { easy: number; medium: number; hard: number };
  /** Per-question explicit score when `mode === "manual"`. Sum must
   *  equal `maxScore` — wizard validation enforces this. */
  perQuestion?: Record<string, number>;
  /** Các phần khi `mode === "by-part"`. Σ points phải bằng `maxScore`. */
  parts?: ScorePart[];

  /**
   * Cách chấm hai dạng câu mà đúng/sai không đủ mô tả — trắc nghiệm nhiều đáp
   * án và Đúng/Sai nhiều ý.
   *
   * Không khai báo = chấm TOÀN PHẦN như trước, nên ca thi cũ giữ nguyên kết
   * quả. Trước đây chỉ đề YCCĐ cài được mấy thứ này; giáo viên ra đề kiểm tra
   * ngắn không cần dựng bộ YCCĐ chi tiết nhưng vẫn cần Đúng/Sai lũy tiến.
   */
  mcqMulti?: "full" | "partial";
  ds?: "graduated" | "weighted" | "full";
  /** Số ý đúng → phần điểm (0..1), khi `ds === "graduated"`. */
  dsGraduatedTable?: Record<number, number>;
}

/**
 * Ba phần mặc định theo cấu trúc đề định kỳ phổ biến (thang 10).
 *
 * Chỉ là ĐIỂM KHỞI ĐẦU: giáo viên thêm/bớt phần, đổi tên, đổi dạng câu hỏi và
 * đổi điểm thoải mái. Các dạng không nằm trong ba phần này (nối, sắp xếp, kéo
 * thả, gạch chân, tự luận…) giáo viên tự thêm phần cho chúng khi cần.
 */
export const MOET_DEFAULT_SCORE_PARTS: ScorePart[] = [
  {
    id: "part-1",
    label: "Phần I — Trắc nghiệm nhiều lựa chọn",
    questionTypes: ["mcq-single", "mcq-multi"],
    points: 4,
  },
  {
    id: "part-2",
    label: "Phần II — Đúng/Sai nhiều ý",
    questionTypes: ["multi-tf", "true-false"],
    points: 4,
  },
  {
    id: "part-3",
    label: "Phần III — Trả lời ngắn",
    questionTypes: ["short-answer", "fill-blank"],
    points: 2,
  },
];

/** Sensible default — most VN schools score on a 10-point scale, even. */
export const DEFAULT_SCORING: ScoringConfig = {
  maxScore: 10,
  mode: "even",
  difficultyWeights: { easy: 1, medium: 1.5, hard: 2 },
};

/**
 * Three-level student-facing result visibility:
 *   - "full"       — show score + per-question correctness + comments
 *   - "score-only" — only the score hero card, hide per-question detail
 *   - "hidden"     — block the result page entirely; teacher will release later
 *
 * Defaults to "full" for back-compat with shifts created before this field.
 */
export type StudentResultVisibility = "full" | "score-only" | "hidden";

export const DEFAULT_RESULT_VISIBILITY: StudentResultVisibility = "full";

export interface AntiCheatConfig {
  /** Reshuffle question order per student. */
  randomizeQuestions: boolean;
  /** Reshuffle MCQ option order per student. */
  randomizeOptions: boolean;
  /** Force fullscreen; exit triggers a warning / auto-submit. */
  requireFullscreen: boolean;
  /** Detect tab / window switching and log/end the attempt. */
  blockTabSwitch: boolean;
  /** Disable copy / paste / cut shortcuts. */
  blockCopyPaste: boolean;
  /** Disable right-click context menu. */
  blockRightClick: boolean;
  /** Webcam stream required throughout the shift. */
  requireWebcam: boolean;
  /** Periodic face detection sample. */
  faceDetection: boolean;
  /** Student can't pause / resume — single linear attempt. */
  oneTimeStart: boolean;
}

export const DEFAULT_ANTI_CHEAT: AntiCheatConfig = {
  randomizeQuestions: true,
  randomizeOptions: true,
  requireFullscreen: true,
  blockTabSwitch: true,
  blockCopyPaste: true,
  blockRightClick: true,
  requireWebcam: false,
  faceDetection: false,
  oneTimeStart: true,
};

export interface ExamShift {
  id: string;
  name: string;

  // Step 1 — Đối tượng
  gradeId: string;
  subjectId: string;
  classIds: string[];

  // Step 2 — Bộ đề
  packageId: string;

  // Step 3 — Lịch thi
  /** Absolute time student CAN start (ISO). */
  startAt: string;
  /** Absolute deadline by which student must submit (ISO). */
  endAt: string;
  /** Minutes during which late entry is still allowed past `startAt`. */
  lateJoinMinutes: number;

  // Step 4 — Phòng & giám thị
  rooms: ShiftRoom[];

  /** Optional scoring overlay — defaults to even-distribution on 10 if absent
   *  (back-compat for shifts created before the scoring step existed). */
  scoring?: ScoringConfig;

  /** Question ordering for each đề. Absent → legacy "shuffle-all". */
  orderStrategy?: ExamOrderStrategy;
  /** Show mạch/phần headings at runtime (only with "by-section"). */
  showSectionHeadings?: boolean;

  /** How much of their result a student is allowed to see after the shift
   *  ends. Teachers and admins always see everything via /reports. */
  studentResultVisibility?: StudentResultVisibility;

  /** Grading deadline for THIS shift's essays (epoch ms). Applies to every
   *  assigned grader — after it passes, graders can no longer create / edit
   *  / delete essay grades (enforced client-side + in firestore.rules via a
   *  cross-doc read of this field). Null / absent = no time limit. Admin can
   *  extend it any time to re-open grading. */
  gradingDeadlineMs?: number | null;

  // Step 5 — Cấu hình
  antiCheat: AntiCheatConfig;

  // Meta
  campusId: string | null;
  ownerId: string;
  ownerName: string;
  status: ShiftStatus;

  /** Soft-delete bookkeeping. `archivedAt != null` hides the shift
   *  from list views and blocks edits. Hard delete is forbidden —
   *  attempts, audit, and analytics all reference shifts forever. */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  createdAt: string;
  updatedAt: string;
}
