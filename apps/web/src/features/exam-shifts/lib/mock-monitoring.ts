/**
 * Live monitoring uses deterministic-pseudo-random fake data so the demo
 * looks alive without an attempts backend. Same `(shift, student)` pair
 * always resolves to the same baseline; only `elapsedMin` and a few
 * derived fields change with the wall clock.
 *
 * Once the real attempts service exists, replace `generateMonitorRow()`
 * with a query against it — the page consumes the `MonitorRow` shape
 * already so the UI doesn't need to change.
 */

import type { ExamShift } from "../data/types";
import { effectiveShiftStatus } from "../data/types";

export type AttemptState =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "violated"
  | "absent";

export interface MonitorRow {
  studentId: string;
  state: AttemptState;
  /** Question index currently being answered (0-based). */
  currentQuestion: number;
  /** Percentage of progress through the exam. */
  progress: number;
  /** Wall-clock minutes since the student joined (or until joinable). */
  elapsedMin: number;
  /** Detected anti-cheat violations so far in this attempt. */
  violations: number;
  /** Tag describing the most recent activity. */
  lastEvent: string;
  /** Whether the proctor has already issued a warning to this student. */
  warned: boolean;
}

/** djb2-style hash → 32-bit unsigned int. Stable across runtimes. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
/** Deterministic [0, 1) random for a `(shift, student, salt)` triplet. */
function rnd(shiftId: string, studentId: string, salt: string): number {
  return (hash(`${shiftId}|${studentId}|${salt}`) % 10_000) / 10_000;
}

/**
 * Map the global shift state + a stable per-student lottery into an
 * attempt state. The proportions are picked to read "lively" on the
 * monitor without anomalies dominating the screen.
 */
function pickState(
  shift: ExamShift,
  studentId: string,
  totalDurationMin: number,
  elapsedMin: number,
  now: number,
): AttemptState {
  const eff = effectiveShiftStatus(shift, now);
  if (eff === "scheduled" || eff === "draft") return "not-started";
  if (eff === "cancelled") return "absent";

  const lottery = rnd(shift.id, studentId, "state");

  if (eff === "completed") {
    if (lottery < 0.06) return "absent"; // ~6% no-show
    if (lottery < 0.12) return "violated"; // ~6% flagged
    return "submitted";
  }

  // in-progress
  if (lottery < 0.08) return "absent";
  if (lottery < 0.14) return "violated";
  const progressShare = elapsedMin / Math.max(1, totalDurationMin);
  if (lottery < 0.18 + progressShare * 0.55) return "submitted";
  return "in-progress";
}

const LAST_EVENTS = [
  "Đang làm câu MCQ",
  "Đang làm câu tự luận",
  "Đã đánh dấu để xem lại",
  "Chuyển sang phần II",
  "Mở lại câu trước",
  "Tab focus",
  "Click chuột",
];
const VIOLATION_EVENTS = [
  "Thoát fullscreen",
  "Chuyển tab",
  "Copy bị chặn",
  "Mất kết nối camera",
  "Webcam không thấy mặt",
];

export function generateMonitorRow(
  shift: ExamShift,
  studentId: string,
  now: number = Date.now(),
): MonitorRow {
  const startMs = new Date(shift.startAt).getTime();
  const endMs = new Date(shift.endAt).getTime();
  const totalMin = Math.max(1, Math.round((endMs - startMs) / 60_000));
  const elapsedMs = Math.max(0, Math.min(now - startMs, endMs - startMs));
  const elapsedMin = Math.round(elapsedMs / 60_000);

  const state = pickState(shift, studentId, totalMin, elapsedMin, now);

  // Progress ramps with elapsed time + a small per-student jitter so two
  // students at the same minute look slightly different.
  const jitter = rnd(shift.id, studentId, "jitter") * 0.2 - 0.1; // ±10%
  const baseProgress = elapsedMs / Math.max(1, endMs - startMs);
  let progress = Math.round((baseProgress + jitter) * 100);
  if (state === "not-started") progress = 0;
  else if (state === "submitted") progress = 100;
  else if (state === "absent") progress = 0;
  else if (state === "violated") progress = Math.max(0, Math.min(95, progress));
  progress = Math.max(0, Math.min(100, progress));

  const totalQuestions = 20;
  const currentQuestion = Math.min(
    totalQuestions - 1,
    Math.max(0, Math.floor((progress / 100) * totalQuestions)),
  );

  const violations =
    state === "violated"
      ? 1 + Math.floor(rnd(shift.id, studentId, "vio") * 4) // 1–4
      : state === "in-progress" && rnd(shift.id, studentId, "minor") < 0.1
        ? 1
        : 0;

  const lastEvent =
    state === "violated"
      ? VIOLATION_EVENTS[
          Math.floor(rnd(shift.id, studentId, "vev") * VIOLATION_EVENTS.length)
        ]!
      : state === "submitted"
        ? "Đã nộp bài"
        : state === "absent"
          ? "Không vào ca"
          : state === "not-started"
            ? "Chờ vào ca"
            : LAST_EVENTS[
                Math.floor(rnd(shift.id, studentId, "ev") * LAST_EVENTS.length)
              ]!;

  return {
    studentId,
    state,
    currentQuestion,
    progress,
    elapsedMin,
    violations,
    lastEvent,
    warned: violations >= 2,
  };
}

export const ATTEMPT_LABEL: Record<AttemptState, string> = {
  "not-started": "Chưa vào",
  "in-progress": "Đang thi",
  submitted: "Đã nộp",
  violated: "Vi phạm",
  absent: "Vắng mặt",
};

export const ATTEMPT_TONE: Record<AttemptState, string> = {
  "not-started": "bg-slate-100 text-slate-700 border-slate-200",
  "in-progress": "bg-emerald-100 text-emerald-800 border-emerald-200",
  submitted: "bg-blue-100 text-blue-800 border-blue-200",
  violated: "bg-rose-100 text-rose-800 border-rose-200",
  absent: "bg-amber-100 text-amber-800 border-amber-200",
};
