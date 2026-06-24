/**
 * Pure-functions library — given a student's id + the attempt stores'
 * raw arrays, derive a `StudentProgress` summary the UI can render and
 * the AI assess endpoint can summarise.
 *
 * Kept framework-agnostic (no React, no zustand) so the API route can
 * reuse the same shape when serialising the AI prompt.
 */

import type { StudentAttempt } from "@/features/shift-exam/state/attempts-store";
import type {
  Homework,
  HomeworkAttempt,
} from "@/features/homework/data/types";
import type { ExamShift } from "@/features/exam-shifts/data/types";

export interface StudentProgressKpis {
  /** Number of shifts the student was assigned (eligible to take). */
  totalShifts: number;
  /** Number of shifts actually submitted. */
  totalShiftsSubmitted: number;
  /** Number of homework assignments the student was assigned. */
  totalHomework: number;
  /** Number of homework actually submitted. */
  totalHomeworkSubmitted: number;
  /** Average exam score on a 0–10 scale. Null when no submission. */
  avgExamScore: number | null;
  /** Average homework correctness on a 0–100% scale. Null when no submission. */
  avgHomeworkPercent: number | null;
  /** Pass rate (count of submissions where exam ≥ 5/10) over total submitted. */
  examPassRate: number | null;
  /** Homework "Đạt" rate (≥ 50% correct) over total submitted homework. */
  homeworkPassRate: number | null;
}

export interface ScorePoint {
  /** ISO date of the submission. */
  at: string;
  /** Score on the matching scale (0–10 for exam, 0–100 for homework). */
  score: number;
  /** Display label for the source (shift name / homework title). */
  label: string;
}

export interface TrendResult {
  /** "improving" / "declining" / "stable" / "insufficient-data". */
  verdict: "improving" | "declining" | "stable" | "insufficient-data";
  /** Δ between recent vs prior window, in the source scale. Null when
   *  there isn't enough data to compute. */
  delta: number | null;
  /** Human label for the comparison: "+1.2 điểm / 30 ngày qua". */
  label: string;
  /** Average over the RECENT window. Null when no data. */
  recentAvg: number | null;
  /** Average over the PRIOR window (the one before recent). Null when
   *  there isn't a prior window with enough data. */
  priorAvg: number | null;
}

export interface StudentProgress {
  studentId: string;
  kpis: StudentProgressKpis;
  /** Exam scores sorted by submitted date ASC. */
  examTimeline: ScorePoint[];
  /** Homework scores sorted by submitted date ASC. */
  homeworkTimeline: ScorePoint[];
  examTrend: TrendResult;
  homeworkTrend: TrendResult;
  /** Last 5 activities across both attempt types, newest first. */
  recentActivity: Array<{
    kind: "exam" | "homework";
    at: string;
    label: string;
    score: number;
  }>;
}

interface ComputeArgs {
  studentId: string;
  /** Exam shifts the student is eligible for (already pre-filtered by
   *  caller — pass everything the student CAN take). */
  shifts: ExamShift[];
  /** ALL shift-exam attempts (will be filtered to this student here). */
  attempts: StudentAttempt[];
  /** Homework the student is eligible for (pre-filtered). */
  homework: Homework[];
  /** ALL homework attempts (will be filtered to this student here). */
  homeworkAttempts: HomeworkAttempt[];
  /** Window size in days for the recent vs prior split. Default 30. */
  windowDays?: number;
}

export function computeStudentProgress({
  studentId,
  shifts,
  attempts,
  homework,
  homeworkAttempts,
  windowDays = 30,
}: ComputeArgs): StudentProgress {
  const mine = attempts.filter((a) => a.studentId === studentId);
  const submittedExams = mine.filter((a) => a.submittedAt != null);
  const mineHw = homeworkAttempts.filter((a) => a.studentId === studentId);
  const submittedHw = mineHw.filter((a) => a.submittedAt != null);

  // Build exam timeline on a 0-10 scale.
  // NOTE: attempts-store.submit() stores `score` as a 0–100 PERCENT
  // (round(correct/total * 100)) and `maxScore` as the question COUNT —
  // NOT points. So the 0–10 value is simply percent / 10. (The old code
  // did (score / maxScore) * 10, which treated the percent as points and
  // produced impossible values like 48.89/10 or 62.5/10.)
  const examTimeline: ScorePoint[] = submittedExams
    .filter((a) => a.score != null)
    .map((a) => {
      const shift = shifts.find((s) => s.id === a.shiftId);
      const normalised = Math.max(0, Math.min(10, a.score! / 10));
      return {
        at: a.submittedAt!,
        score: Math.round(normalised * 100) / 100,
        label: shift?.name ?? a.shiftId,
      };
    })
    .sort((x, y) => (x.at < y.at ? -1 : 1));

  // Build homework timeline on a 0-100 scale.
  const homeworkTimeline: ScorePoint[] = submittedHw
    .filter((a) => a.correctCount != null)
    .map((a) => {
      const hw = homework.find((h) => h.id === a.homeworkId);
      const total = hw?.questionIds.length ?? 0;
      const pct = total > 0 ? ((a.correctCount ?? 0) / total) * 100 : 0;
      return {
        at: a.submittedAt!,
        score: Math.round(pct),
        label: hw?.title ?? a.homeworkId,
      };
    })
    .sort((x, y) => (x.at < y.at ? -1 : 1));

  const avgExamScore =
    examTimeline.length > 0
      ? Math.round(
          (examTimeline.reduce((s, p) => s + p.score, 0) / examTimeline.length) *
            10,
        ) / 10
      : null;
  const avgHomeworkPercent =
    homeworkTimeline.length > 0
      ? Math.round(
          homeworkTimeline.reduce((s, p) => s + p.score, 0) /
            homeworkTimeline.length,
        )
      : null;

  const examPassRate =
    examTimeline.length > 0
      ? examTimeline.filter((p) => p.score >= 5).length / examTimeline.length
      : null;
  const homeworkPassRate =
    homeworkTimeline.length > 0
      ? homeworkTimeline.filter((p) => p.score >= 50).length /
        homeworkTimeline.length
      : null;

  const kpis: StudentProgressKpis = {
    totalShifts: shifts.length,
    totalShiftsSubmitted: submittedExams.length,
    totalHomework: homework.length,
    totalHomeworkSubmitted: submittedHw.length,
    avgExamScore,
    avgHomeworkPercent,
    examPassRate,
    homeworkPassRate,
  };

  const examTrend = computeTrend(examTimeline, windowDays, "exam");
  const homeworkTrend = computeTrend(
    homeworkTimeline,
    windowDays,
    "homework",
  );

  // Build "recent activity" — last 5 across both, newest first.
  const merged: Array<{
    kind: "exam" | "homework";
    at: string;
    label: string;
    score: number;
  }> = [];
  for (const p of examTimeline) {
    merged.push({ kind: "exam", at: p.at, label: p.label, score: p.score });
  }
  for (const p of homeworkTimeline) {
    merged.push({
      kind: "homework",
      at: p.at,
      label: p.label,
      score: p.score,
    });
  }
  merged.sort((x, y) => (x.at > y.at ? -1 : 1));
  const recentActivity = merged.slice(0, 5);

  return {
    studentId,
    kpis,
    examTimeline,
    homeworkTimeline,
    examTrend,
    homeworkTrend,
    recentActivity,
  };
}

function computeTrend(
  timeline: ScorePoint[],
  windowDays: number,
  kind: "exam" | "homework",
): TrendResult {
  if (timeline.length < 3) {
    return {
      verdict: "insufficient-data",
      delta: null,
      label: "Cần ≥ 3 lượt làm bài để đánh giá xu hướng",
      recentAvg: null,
      priorAvg: null,
    };
  }
  const cutoff = Date.now() - windowDays * 24 * 3600_000;
  const recent = timeline.filter((p) => new Date(p.at).getTime() >= cutoff);
  const prior = timeline.filter((p) => new Date(p.at).getTime() < cutoff);

  // Both windows need ≥ 1 point. Special case: if the student only
  // recently started, prior is empty — compare first-half vs second-half
  // of the available timeline so we can still surface a trend.
  let recentAvg: number;
  let priorAvg: number;
  if (recent.length >= 1 && prior.length >= 1) {
    recentAvg = recent.reduce((s, p) => s + p.score, 0) / recent.length;
    priorAvg = prior.reduce((s, p) => s + p.score, 0) / prior.length;
  } else {
    // Split the full timeline 50/50.
    const half = Math.floor(timeline.length / 2);
    if (half < 1) {
      return {
        verdict: "insufficient-data",
        delta: null,
        label: "Cần ≥ 3 lượt làm bài để đánh giá xu hướng",
        recentAvg: null,
        priorAvg: null,
      };
    }
    const earlier = timeline.slice(0, half);
    const later = timeline.slice(half);
    priorAvg = earlier.reduce((s, p) => s + p.score, 0) / earlier.length;
    recentAvg = later.reduce((s, p) => s + p.score, 0) / later.length;
  }

  const delta = recentAvg - priorAvg;
  // Tolerance band — within ±5% of scale → stable.
  const tolerance = kind === "exam" ? 0.5 : 5;
  let verdict: TrendResult["verdict"];
  if (Math.abs(delta) <= tolerance) verdict = "stable";
  else if (delta > 0) verdict = "improving";
  else verdict = "declining";

  const unit = kind === "exam" ? "điểm" : "%";
  const sign = delta >= 0 ? "+" : "";
  const label = `${sign}${(Math.round(delta * 10) / 10).toFixed(1)} ${unit}`;

  return {
    verdict,
    delta: Math.round(delta * 100) / 100,
    label,
    recentAvg: Math.round(recentAvg * 100) / 100,
    priorAvg: Math.round(priorAvg * 100) / 100,
  };
}
