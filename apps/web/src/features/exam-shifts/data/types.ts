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
 *
 * The student's final shift score is the sum of per-question scores
 * awarded (full credit for auto-graded correct, ratio of essay rubric for
 * manually-graded). Auto-graded incorrect = 0.
 */
export type ScoringMode = "even" | "by-difficulty" | "manual";

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
}

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

  /** How much of their result a student is allowed to see after the shift
   *  ends. Teachers and admins always see everything via /reports. */
  studentResultVisibility?: StudentResultVisibility;

  // Step 5 — Cấu hình
  antiCheat: AntiCheatConfig;

  // Meta
  campusId: string | null;
  ownerId: string;
  ownerName: string;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
}
