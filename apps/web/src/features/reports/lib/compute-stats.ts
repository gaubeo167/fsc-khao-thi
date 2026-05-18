/**
 * Pure functions that crunch the report stats for a single completed
 * shift. Everything in here is deterministic — given the same attempts +
 * questions + grading, returns the same numbers. The UI memoises calls
 * keyed on `shiftId`.
 */

import type { ExamShift } from "@/features/exam-shifts/data/types";
import { DEFAULT_SCORING } from "@/features/exam-shifts/data/types";
import {
  computePerQuestionScores,
  formatScore,
} from "@/features/exam-shifts/lib/scoring";
import type { EssayGrade } from "@/features/grading/state/grading-store";
import type {
  Difficulty,
  Question,
} from "@/features/question-bank/data/seed-questions";
import type { Answer, StudentAttempt } from "@/features/shift-exam/state/attempts-store";

/** Auto-grading mirror — must match attempts-store.gradeOne in spirit. */
export function isAnswerCorrect(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "mcq-single":
      if (a.kind !== "mcq-single" || !a.optionId) return false;
      return q.options.find((o) => o.isCorrect)?.id === a.optionId;
    case "mcq-multi": {
      if (a.kind !== "mcq-multi") return false;
      const correctIds = new Set(
        q.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      return (
        a.optionIds.length === correctIds.size &&
        a.optionIds.every((id) => correctIds.has(id))
      );
    }
    case "true-false":
      return a.kind === "true-false" && a.value === q.correctAnswer;
    case "multi-tf":
      return (
        a.kind === "multi-tf" &&
        q.subQuestions.every((s) => a.values[s.id] === s.correctAnswer)
      );
    case "short-answer": {
      if (a.kind !== "short-answer") return false;
      const norm = (s: string) =>
        q.caseSensitive ? s.trim() : s.trim().toLowerCase();
      return q.acceptedAnswers.map(norm).includes(norm(a.text));
    }
    case "fill-blank": {
      if (a.kind !== "fill-blank") return false;
      return q.blanks.every((b, i) => {
        const guess = (a.blanks[i] ?? "").trim().toLowerCase();
        return b.acceptedAnswers
          .map((s) => s.trim().toLowerCase())
          .includes(guess);
      });
    }
    case "matching":
      return (
        a.kind === "matching" &&
        q.pairs.every((p) => a.pairings[p.id] === p.id)
      );
    case "ordering": {
      if (a.kind !== "ordering") return false;
      const correct = q.items.map((it) => it.id);
      return (
        a.orderedIds.length === correct.length &&
        a.orderedIds.every((id, i) => id === correct[i])
      );
    }
    case "drag-drop": {
      if (a.kind !== "drag-drop") return false;
      const norm = (s: string) => (s ?? "").trim().toLowerCase();
      return q.zones.every(
        (z, i) => norm(a.zones[i] ?? "") === norm(z.correctContent),
      );
    }
    case "underline": {
      if (a.kind !== "underline") return false;
      const correctSet = new Set<string>();
      const re = /\[u:([^\]\n]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        correctSet.add(m[1]!.trim().toLowerCase());
      }
      const studentSet = new Set(
        a.underlinedPhrases.map((p) => p.trim().toLowerCase()),
      );
      return (
        studentSet.size === correctSet.size &&
        Array.from(correctSet).every((p) => studentSet.has(p))
      );
    }
    default:
      return false;
  }
}

export type GradeBand = "Giỏi" | "Khá" | "Trung bình" | "Chưa đạt";

export function bandForScore(percent: number): GradeBand {
  if (percent >= 80) return "Giỏi";
  if (percent >= 65) return "Khá";
  if (percent >= 50) return "Trung bình";
  return "Chưa đạt";
}

export interface PerStudentRow {
  attempt: StudentAttempt;
  /** Combined raw score (under shift scoring, e.g. 7.5). */
  raw: number;
  /** Same on 0-100 scale. */
  percent: number;
  band: GradeBand;
  /** Time taken in minutes. `null` if startedAt/submittedAt are off. */
  durationMin: number | null;
  /** Auto-graded correct count. */
  correctCount: number;
  autoMax: number;
  violations: number;
  pendingEssay: number;
}

export interface PerQuestionRow {
  question: Question;
  /** How many students were ASSIGNED this question. */
  totalAssigned: number;
  /** Of those, how many answered correctly. */
  correct: number;
  /** Of those, how many answered but were wrong. */
  wrong: number;
  /** Of those, how many didn't answer at all (left blank). */
  blank: number;
  /** Correct%, only for auto-graded questions (essay is null). */
  correctPercent: number | null;
  /** Difficulty for grouping. */
  difficulty: Difficulty;
  /** Whether this is manually-graded (essay / ai-generated). */
  isManual: boolean;
  /** Pre-computed per-question weight under the shift's scoring config. */
  weight: number;
}

export interface ShiftReport {
  shift: ExamShift;
  perStudent: PerStudentRow[];
  perQuestion: PerQuestionRow[];
  /** Aggregate KPIs. */
  totals: {
    /** Students who actually submitted. */
    submitted: number;
    /** Eligible students (assigned to a room or in shift.classIds). */
    eligible: number;
    /** Absent = eligible - submitted. */
    absent: number;
    avgRaw: number;
    avgPercent: number;
    passRate: number;
    bestRaw: number;
    worstRaw: number;
    avgDurationMin: number | null;
    totalViolations: number;
    pendingEssayCount: number;
  };
  /** Score distribution buckets (0-50, 50-65, 65-80, 80-100). */
  distribution: Array<{ band: GradeBand; count: number; percent: number }>;
}

interface BuildArgs {
  shift: ExamShift;
  attempts: StudentAttempt[];
  questions: Question[];
  essayGrades: EssayGrade[];
  /** Total eligible students (from room.studentIds or class derivation). */
  eligible: number;
}

export function buildShiftReport({
  shift,
  attempts,
  questions,
  essayGrades,
  eligible,
}: BuildArgs): ShiftReport {
  const scoring = shift.scoring ?? DEFAULT_SCORING;
  const submitted = attempts.filter((a) => a.submittedAt != null);
  const examMaxScoreForPool = (() => {
    // Pool-wide max from scoring config — used for normalisation of
    // per-question weights consistently across students even if each
    // student saw a different subset.
    return scoring.maxScore;
  })();
  void examMaxScoreForPool;

  // ───── Per-student rows
  const perStudent: PerStudentRow[] = [];
  for (const att of submitted) {
    const examQs = att.questionIds
      .map((qid) => questions.find((q) => q.id === qid))
      .filter((q): q is Question => !!q);
    const perQ = computePerQuestionScores(scoring, examQs);
    const examMax = Object.values(perQ).reduce((a, n) => a + n, 0);

    let earned = 0;
    let correctCount = 0;
    let autoMax = 0;
    let pending = 0;
    for (const q of examQs) {
      const qWeight = perQ[q.id] ?? 0;
      const ans = att.answers[q.id];
      if (q.type === "essay" || q.type === "ai-generated") {
        const g = essayGrades.find(
          (eg) => eg.attemptId === att.id && eg.questionId === q.id,
        );
        if (g) {
          const ratio = g.maxPoints > 0 ? g.totalPoints / g.maxPoints : 0;
          earned += ratio * qWeight;
        } else {
          pending++;
        }
        continue;
      }
      autoMax++;
      if (ans && isAnswerCorrect(q, ans)) {
        correctCount++;
        earned += qWeight;
      }
    }
    const percent =
      examMax > 0 ? Math.round((earned / examMax) * 100) : 0;
    const raw = Math.round(earned * 100) / 100;
    const startedMs = new Date(att.startedAt).getTime();
    const submittedMs = att.submittedAt
      ? new Date(att.submittedAt).getTime()
      : null;
    const durationMin =
      submittedMs && Number.isFinite(startedMs)
        ? Math.max(0, Math.round((submittedMs - startedMs) / 60_000))
        : null;
    perStudent.push({
      attempt: att,
      raw,
      percent,
      band: bandForScore(percent),
      durationMin,
      correctCount,
      autoMax,
      violations:
        att.violations.tabSwitches +
        att.violations.fullscreenExits +
        att.violations.pasteAttempts,
      pendingEssay: pending,
    });
  }

  // ───── Per-question rows: aggregate across all submitted attempts.
  // We use the blueprint's pool questions (the `questions` arg) — not all
  // students saw every question due to per-student shuffle.
  const perQuestion: PerQuestionRow[] = questions.map((q) => {
    let total = 0;
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    for (const att of submitted) {
      if (!att.questionIds.includes(q.id)) continue;
      total++;
      const ans = att.answers[q.id];
      if (q.type === "essay" || q.type === "ai-generated") {
        // For essay, "correct" means the grader awarded >= 50% of rubric.
        const g = essayGrades.find(
          (eg) => eg.attemptId === att.id && eg.questionId === q.id,
        );
        if (!g) {
          // Pending — count as blank for aggregate purposes.
          blank++;
        } else if (g.totalPoints / Math.max(1, g.maxPoints) >= 0.5) {
          correct++;
        } else {
          wrong++;
        }
        continue;
      }
      if (!ans) {
        blank++;
      } else if (isAnswerCorrect(q, ans)) {
        correct++;
      } else {
        wrong++;
      }
    }
    // Weight = average per-question score this question would get under
    // the shift's scoring config. Approximate by computing the average
    // weight across the submitted attempts that included it.
    const weights: number[] = [];
    for (const att of submitted) {
      if (!att.questionIds.includes(q.id)) continue;
      const examQs = att.questionIds
        .map((qid) => questions.find((qq) => qq.id === qid))
        .filter((qq): qq is Question => !!qq);
      const perQ = computePerQuestionScores(scoring, examQs);
      if (perQ[q.id] != null) weights.push(perQ[q.id]!);
    }
    const weight =
      weights.length > 0
        ? weights.reduce((a, n) => a + n, 0) / weights.length
        : 0;
    return {
      question: q,
      totalAssigned: total,
      correct,
      wrong,
      blank,
      correctPercent:
        total > 0 && q.type !== "essay" && q.type !== "ai-generated"
          ? Math.round((correct / total) * 100)
          : q.type === "essay" || q.type === "ai-generated"
            ? total > 0
              ? Math.round(((correct + wrong) > 0 ? correct / (correct + wrong) : 0) * 100)
              : null
            : null,
      difficulty: q.difficulty,
      isManual: q.type === "essay" || q.type === "ai-generated",
      weight,
    };
  });

  // ───── Totals
  const submittedCount = perStudent.length;
  const avgRaw =
    submittedCount > 0
      ? Math.round(
          (perStudent.reduce((a, r) => a + r.raw, 0) / submittedCount) * 100,
        ) / 100
      : 0;
  const avgPercent =
    submittedCount > 0
      ? Math.round(
          perStudent.reduce((a, r) => a + r.percent, 0) / submittedCount,
        )
      : 0;
  const passCount = perStudent.filter((r) => r.percent >= 50).length;
  const passRate =
    submittedCount > 0 ? Math.round((passCount / submittedCount) * 100) : 0;
  const bestRaw =
    submittedCount > 0
      ? Math.max(...perStudent.map((r) => r.raw))
      : 0;
  const worstRaw =
    submittedCount > 0
      ? Math.min(...perStudent.map((r) => r.raw))
      : 0;
  const durations = perStudent
    .map((r) => r.durationMin)
    .filter((d): d is number => d != null);
  const avgDurationMin =
    durations.length > 0
      ? Math.round(durations.reduce((a, d) => a + d, 0) / durations.length)
      : null;
  const totalViolations = perStudent.reduce(
    (a, r) => a + r.violations,
    0,
  );
  const pendingEssayCount = perStudent.reduce(
    (a, r) => a + r.pendingEssay,
    0,
  );

  // ───── Distribution
  const distMap: Record<GradeBand, number> = {
    "Giỏi": 0,
    "Khá": 0,
    "Trung bình": 0,
    "Chưa đạt": 0,
  };
  for (const r of perStudent) distMap[r.band]++;
  const distribution: ShiftReport["distribution"] = (
    ["Giỏi", "Khá", "Trung bình", "Chưa đạt"] as GradeBand[]
  ).map((band) => ({
    band,
    count: distMap[band],
    percent:
      submittedCount > 0
        ? Math.round((distMap[band] / submittedCount) * 100)
        : 0,
  }));

  return {
    shift,
    perStudent,
    perQuestion,
    totals: {
      submitted: submittedCount,
      eligible,
      absent: Math.max(0, eligible - submittedCount),
      avgRaw,
      avgPercent,
      passRate,
      bestRaw,
      worstRaw,
      avgDurationMin,
      totalViolations,
      pendingEssayCount,
    },
    distribution,
  };
}

export function shiftReportSummary(r: ShiftReport): string {
  return `${r.totals.submitted}/${r.totals.eligible} HS · TB ${formatScore(r.totals.avgRaw)}/${formatScore(
    r.shift.scoring?.maxScore ?? 10,
  )} (${r.totals.avgPercent}%) · ${r.totals.passRate}% đạt`;
}
