"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  ShieldAlert,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { DEFAULT_SCORING } from "@/features/exam-shifts/data/types";
import {
  computePerQuestionScores,
  formatScore,
} from "@/features/exam-shifts/lib/scoring";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import {
  useAttemptsStore,
  type Answer,
} from "@/features/shift-exam/state/attempts-store";
import { cn } from "@/lib/utils";

/**
 * Teacher / admin view of a single student's submission for a shift.
 *
 * Differs from the student-facing `/exam/[shiftId]/result` page:
 *   - Always shows full per-question detail regardless of
 *     `shift.studentResultVisibility` — the visibility setting is a
 *     student-side gate, not a teacher-side one.
 *   - Renders the student's authored answer AND the correct answer
 *     side-by-side, including essay rubric scores + comments.
 *   - Gated by teacher subject/grade scope; superadmin + campus admin
 *     pass through.
 */
export default function ReportAttemptDetailPage() {
  const params = useParams<{ shiftId: string; attemptId: string }>();
  const shiftId = params.shiftId;
  const attemptId = params.attemptId;
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const shift = useShiftsStore((s) => s.shifts.find((x) => x.id === shiftId));
  const attempt = useAttemptsStore((s) =>
    s.attempts.find((a) => a.id === attemptId),
  );
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const users = useUsersStore((s) => s.users);
  const essayGradesAll = useGradingStore((s) => s.grades);

  const essayGrades = useMemo(
    () =>
      attempt ? essayGradesAll.filter((g) => g.attemptId === attempt.id) : [],
    [essayGradesAll, attempt],
  );

  if (!shift || !attempt || attempt.shiftId !== shift.id) return notFound();
  if (campusId && shift.campusId !== campusId) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Ca thi không thuộc campus đang chọn.
      </div>
    );
  }
  // Same scope gate as the parent /reports/[shiftId] page.
  if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
    const outOfSubject = !scope.allowedSubjectIds.has(shift.subjectId);
    const outOfGrade =
      scope.allowedGradeIds != null &&
      !scope.allowedGradeIds.has(shift.gradeId);
    if (outOfSubject || outOfGrade) {
      return (
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
          <p className="text-[14px] font-semibold">
            🔒 Bạn không có quyền xem bài làm này
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Ca thi này nằm ngoài môn / khối được giao quản lý của bạn.
          </p>
          <Link
            href="/reports"
            className="mt-4 inline-block text-[12px] font-semibold text-blue-700 hover:underline"
          >
            ← Về danh sách báo cáo
          </Link>
        </div>
      );
    }
  }

  const student = users.find((u) => u.id === attempt.studentId);
  const subject = subjects.find((s) => s.id === shift.subjectId);
  const scoring = shift.scoring ?? DEFAULT_SCORING;

  const examQuestions = attempt.questionIds
    .map((qid) => allQuestions.find((q) => q.id === qid))
    .filter((q): q is Question => !!q);
  const perQuestionScore = computePerQuestionScores(scoring, examQuestions);
  const examMaxScore = Object.values(perQuestionScore).reduce(
    (a, n) => a + n,
    0,
  );

  let earned = 0;
  let autoCorrect = 0;
  let autoMax = 0;
  for (const q of examQuestions) {
    const qScore = perQuestionScore[q.id] ?? 0;
    const ans = attempt.answers[q.id];
    if (q.type === "essay" || q.type === "ai-generated") {
      const g = essayGrades.find((x) => x.questionId === q.id);
      if (g && g.maxPoints > 0) {
        earned += (g.totalPoints / g.maxPoints) * qScore;
      }
      continue;
    }
    autoMax++;
    if (ans && isCorrect(q, ans)) {
      earned += qScore;
      autoCorrect++;
    }
  }
  earned = Math.round(earned * 100) / 100;
  const earnedDisplayMax = Math.round(examMaxScore * 100) / 100;

  const submittedAt = attempt.submittedAt
    ? new Date(attempt.submittedAt)
    : null;
  const startedAt = new Date(attempt.startedAt);
  const durationSec = submittedAt
    ? Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000)
    : 0;
  const totalViolations =
    attempt.violations.tabSwitches +
    attempt.violations.fullscreenExits +
    attempt.violations.pasteAttempts;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card px-5 py-4">
        <Link
          href={`/reports/${shift.id}`}
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12px] font-semibold hover:bg-accent/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Báo cáo ca thi
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {subject && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                {subject.name}
              </span>
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
              {shift.name}
            </span>
          </div>
          <h1 className="mt-1 truncate text-[18px] font-bold leading-tight">
            {student?.name ?? attempt.studentId}
          </h1>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Lớp {student?.className ?? "—"} ·{" "}
            {submittedAt
              ? `Nộp lúc ${submittedAt.toLocaleString("vi-VN")}`
              : "Chưa nộp"}{" "}
            · {formatDuration(durationSec)}
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Trophy className="h-4 w-4" />}
          label="ĐIỂM SỐ"
          value={`${formatScore(earned)} / ${formatScore(earnedDisplayMax)}`}
          tone="emerald"
        />
        <Tile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="TRẮC NGHIỆM"
          value={`${autoCorrect} / ${autoMax}`}
          tone="blue"
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          label="THỜI GIAN"
          value={formatDuration(durationSec)}
          tone="violet"
        />
        <Tile
          icon={<ShieldAlert className="h-4 w-4" />}
          label="VI PHẠM"
          value={String(totalViolations)}
          tone={totalViolations > 0 ? "amber" : "muted"}
        />
      </section>

      {/* Per-question side-by-side */}
      <section className="rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-[14px] font-semibold inline-flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Bài làm chi tiết của HS
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Cột trái: câu trả lời của HS. Cột phải: đáp án đúng. Mỗi câu hiển
            thị điểm được tính.
          </p>
        </header>
        <ol className="divide-y">
          {attempt.questionIds.map((qid, idx) => {
            const q = allQuestions.find((x) => x.id === qid);
            const ans = attempt.answers[qid];
            const qScore = q ? perQuestionScore[q.id] ?? 0 : 0;
            const isManual =
              q && (q.type === "essay" || q.type === "ai-generated");
            const grade = isManual
              ? essayGrades.find((g) => g.questionId === qid)
              : undefined;
            return (
              <li key={qid} className="px-5 py-4">
                <div className="mb-2 flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10.5px] font-bold text-foreground/70">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {q ? (
                      <RenderedContent
                        content={q.content}
                        className="text-[13px] leading-snug"
                      />
                    ) : (
                      <p className="text-[12.5px] italic text-muted-foreground">
                        (Câu hỏi không tồn tại: {qid})
                      </p>
                    )}
                  </div>
                  <CorrectnessBadge
                    q={q}
                    ans={ans}
                    grade={grade}
                    qScore={qScore}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border bg-blue-50/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-700">
                      HS trả lời
                    </p>
                    <div className="mt-1 text-[12.5px] leading-snug text-foreground/90">
                      {q ? renderStudentAnswer(q, ans) : "—"}
                    </div>
                    {grade && grade.comment && (
                      <p className="mt-2 rounded bg-card px-2 py-1 text-[11px] italic text-foreground/80">
                        💬 {grade.graderName}: {grade.comment}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border bg-emerald-50/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                      Đáp án đúng
                    </p>
                    <div className="mt-1 text-[12.5px] leading-snug text-foreground/90">
                      {q ? renderCorrectAnswer(q) : "—"}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function CorrectnessBadge({
  q,
  ans,
  grade,
  qScore,
}: {
  q: Question | undefined;
  ans: Answer | undefined;
  grade:
    | {
        totalPoints: number;
        maxPoints: number;
      }
    | undefined;
  qScore: number;
}) {
  if (!q) return <Circle className="h-4 w-4 text-muted-foreground" />;
  const isManual = q.type === "essay" || q.type === "ai-generated";
  if (isManual) {
    if (grade) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800">
          {grade.totalPoints}/{grade.maxPoints}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
        <Clock className="h-3 w-3" /> Chờ chấm
      </span>
    );
  }
  if (!ans) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-foreground/65">
        Bỏ trống · 0/{formatScore(qScore)}
      </span>
    );
  }
  if (isCorrect(q, ans)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        {formatScore(qScore)}/{formatScore(qScore)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-800">
      <XCircle className="h-3 w-3" />
      0/{formatScore(qScore)}
    </span>
  );
}

/** Render the student's answer for a question — one branch per question type. */
function renderStudentAnswer(q: Question, ans: Answer | undefined) {
  if (!ans) return <span className="italic text-muted-foreground">Bỏ trống</span>;
  switch (q.type) {
    case "mcq-single": {
      if (ans.kind !== "mcq-single" || !ans.optionId) {
        return <span className="italic text-muted-foreground">Bỏ trống</span>;
      }
      const opt = q.options.find((o) => o.id === ans.optionId);
      return opt ? <RenderedContent content={opt.content} /> : "—";
    }
    case "mcq-multi": {
      if (ans.kind !== "mcq-multi" || ans.optionIds.length === 0) {
        return <span className="italic text-muted-foreground">Bỏ trống</span>;
      }
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {ans.optionIds.map((oid) => {
            const opt = q.options.find((o) => o.id === oid);
            return <li key={oid}>{opt ? <RenderedContent content={opt.content} /> : "—"}</li>;
          })}
        </ul>
      );
    }
    case "true-false":
      if (ans.kind !== "true-false" || ans.value == null) {
        return <span className="italic text-muted-foreground">Bỏ trống</span>;
      }
      return <b>{ans.value ? "Đúng" : "Sai"}</b>;
    case "multi-tf":
      if (ans.kind !== "multi-tf") return "—";
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.subQuestions.map((s) => {
            const v = ans.values[s.id];
            return (
              <li key={s.id}>
                <RenderedContent content={s.statement} /> →{" "}
                <b>{v == null ? "—" : v ? "Đúng" : "Sai"}</b>
              </li>
            );
          })}
        </ul>
      );
    case "short-answer":
      if (ans.kind !== "short-answer" || !ans.text.trim()) {
        return <span className="italic text-muted-foreground">Bỏ trống</span>;
      }
      return <span className="font-mono">{ans.text}</span>;
    case "fill-blank":
      if (ans.kind !== "fill-blank") return "—";
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.blanks.map((_, i) => (
            <li key={i}>
              Chỗ {i + 1}:{" "}
              <span className="font-mono">{ans.blanks[i] || "—"}</span>
            </li>
          ))}
        </ul>
      );
    case "matching":
      if (ans.kind !== "matching") return "—";
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.pairs.map((p) => {
            const matchedRight = q.pairs.find((x) => x.id === ans.pairings[p.id]);
            return (
              <li key={p.id}>
                {p.left} → {matchedRight?.right ?? "—"}
              </li>
            );
          })}
        </ul>
      );
    case "ordering":
      if (ans.kind !== "ordering") return "—";
      return (
        <ol className="ml-4 list-decimal space-y-0.5">
          {ans.orderedIds.map((id) => {
            const item = q.items.find((it) => it.id === id);
            return <li key={id}>{item?.content ?? "—"}</li>;
          })}
        </ol>
      );
    case "drag-drop":
      if (ans.kind !== "drag-drop") return "—";
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.zones.map((_, i) => (
            <li key={i}>
              Vị trí {i + 1}:{" "}
              <span className="font-mono">{ans.zones[i] || "—"}</span>
            </li>
          ))}
        </ul>
      );
    case "underline":
      if (ans.kind !== "underline" || ans.underlinedPhrases.length === 0) {
        return <span className="italic text-muted-foreground">Không gạch chân</span>;
      }
      return (
        <span className="font-mono">
          {ans.underlinedPhrases.map((p) => `"${p}"`).join(", ")}
        </span>
      );
    case "essay":
    case "ai-generated":
      if (ans.kind !== q.type || !ans.text.trim()) {
        return <span className="italic text-muted-foreground">Không có bài viết</span>;
      }
      return (
        <p className="whitespace-pre-wrap text-[12.5px]">{ans.text}</p>
      );
    default:
      return <span className="italic text-muted-foreground">—</span>;
  }
}

/** Render the canonical correct answer for a question. */
function renderCorrectAnswer(q: Question) {
  switch (q.type) {
    case "mcq-single": {
      const opt = q.options.find((o) => o.isCorrect);
      return opt ? <RenderedContent content={opt.content} /> : "—";
    }
    case "mcq-multi": {
      const correct = q.options.filter((o) => o.isCorrect);
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {correct.map((o) => (
            <li key={o.id}>
              <RenderedContent content={o.content} />
            </li>
          ))}
        </ul>
      );
    }
    case "true-false":
      return <b>{q.correctAnswer ? "Đúng" : "Sai"}</b>;
    case "multi-tf":
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.subQuestions.map((s) => (
            <li key={s.id}>
              <RenderedContent content={s.statement} /> →{" "}
              <b>{s.correctAnswer ? "Đúng" : "Sai"}</b>
            </li>
          ))}
        </ul>
      );
    case "short-answer":
      return (
        <span className="font-mono">
          {q.acceptedAnswers.join(" / ")}
          {q.caseSensitive && (
            <span className="ml-2 text-[10.5px] text-muted-foreground">
              (phân biệt hoa thường)
            </span>
          )}
        </span>
      );
    case "fill-blank":
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.blanks.map((b, i) => (
            <li key={i}>
              Chỗ {i + 1}:{" "}
              <span className="font-mono">{b.acceptedAnswers.join(" / ")}</span>
            </li>
          ))}
        </ul>
      );
    case "matching":
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.pairs.map((p) => (
            <li key={p.id}>
              {p.left} → {p.right}
            </li>
          ))}
        </ul>
      );
    case "ordering":
      return (
        <ol className="ml-4 list-decimal space-y-0.5">
          {q.items.map((it) => (
            <li key={it.id}>{it.content}</li>
          ))}
        </ol>
      );
    case "drag-drop":
      return (
        <ul className="ml-3 list-disc space-y-0.5">
          {q.zones.map((z, i) => (
            <li key={z.id}>
              Vị trí {i + 1}:{" "}
              <span className="font-mono">{z.correctContent}</span>
            </li>
          ))}
        </ul>
      );
    case "underline": {
      const re = /\[u:([^\]\n]+)\]/g;
      const phrases: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        phrases.push(m[1]!.trim());
      }
      return phrases.length > 0 ? (
        <span className="font-mono">{phrases.map((p) => `"${p}"`).join(", ")}</span>
      ) : (
        <span className="italic text-muted-foreground">(Không có cụm)</span>
      );
    }
    case "essay":
      return (
        <div className="space-y-1">
          <p className="text-[11.5px] font-semibold text-foreground/70">
            Rubric chấm (tổng {q.rubric.reduce((a, c) => a + c.points, 0)} điểm):
          </p>
          <ul className="ml-3 list-disc space-y-0.5">
            {q.rubric.map((c) => (
              <li key={c.id}>
                {c.label} — <b>{c.points} đ</b>
              </li>
            ))}
          </ul>
        </div>
      );
    case "ai-generated":
      return (
        <p className="whitespace-pre-wrap text-[12px] italic text-muted-foreground">
          (Đề mở do AI sinh — chấm theo prompt: "{q.prompt}")
        </p>
      );
    default:
      return <span className="italic text-muted-foreground">—</span>;
  }
}

/** Same correctness rules as result page / attempts-store. */
function isCorrect(q: Question, a: Answer): boolean {
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

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "blue" | "violet" | "amber" | "muted";
}) {
  const toneCls = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    muted: "bg-muted text-foreground/65",
  }[tone];
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span>{label}</span>
        <span className={cn("rounded p-1", toneCls)}>{icon}</span>
      </div>
      <div className="mt-0.5 text-[18px] font-bold leading-tight">{value}</div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
