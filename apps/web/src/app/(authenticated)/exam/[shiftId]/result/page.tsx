"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  EyeOff,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  DEFAULT_SCORING,
  DEFAULT_RESULT_VISIBILITY,
} from "@/features/exam-shifts/data/types";
import { computePerQuestionScores, formatScore } from "@/features/exam-shifts/lib/scoring";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { cn } from "@/lib/utils";

export default function ExamResultPage() {
  const params = useParams<{ shiftId: string }>();
  const shiftId = params.shiftId;
  const session = useAuthStore((s) => s.session);
  const shift = useShiftsStore((s) =>
    s.shifts.find((x) => x.id === shiftId),
  );
  const attempt = useAttemptsStore((s) =>
    session
      ? s.attempts.find(
          (a) => a.shiftId === shiftId && a.studentId === session.userId,
        )
      : undefined,
  );
  const allQuestions = useQuestionsStore((s) => s.questions);
  const ensureQuestions = useQuestionsStore((s) => s.ensureQuestions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);

  // Students load only this attempt's questions on demand (they don't
  // subscribe to the whole bank). `resultQReady` gates the score view so
  // it never renders a wrong score from a half-loaded question set.
  // Production students fetch their submitted attempt's questions (with
  // answers, post-submit) from /api/exam/[id]/review — they don't read
  // /questions directly. Demo/staff use the local bank.
  const useServer = isFirebaseConfigured() && session?.role === "student";
  const [reviewQuestions, setReviewQuestions] = useState<Question[] | null>(null);
  const qIdsKey = attempt?.questionIds?.join(",") ?? "";
  const [resultQReady, setResultQReady] = useState(false);
  useEffect(() => {
    if (!attempt || !attempt.questionIds?.length || useServer) {
      setResultQReady(true);
      return;
    }
    let alive = true;
    setResultQReady(false);
    ensureQuestions(attempt.questionIds).finally(() => {
      if (alive) setResultQReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdsKey, ensureQuestions, useServer]);
  useEffect(() => {
    if (!useServer || !attempt?.submittedAt || !shift) return;
    let alive = true;
    setReviewQuestions(null);
    (async () => {
      try {
        const { authHeaders } = await import("@/lib/api-client");
        const res = await fetch(`/api/exam/${shift.id}/review`, {
          method: "POST",
          headers: { ...(await authHeaders()) },
        });
        if (!alive) return;
        setReviewQuestions(res.ok ? (await res.json()).questions ?? [] : []);
      } catch {
        if (alive) setReviewQuestions([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer, shift?.id, attempt?.submittedAt]);

  // IMPORTANT: every hook below must run on every render. Do NOT add
  // early returns above this comment — React's Rules of Hooks require a
  // stable hook order. Conditional rendering happens at the bottom of
  // this function via plain JSX.
  const allGradesRaw = useGradingStore((s) => s.grades);
  const essayGrades = useMemo(
    () =>
      attempt
        ? allGradesRaw.filter((g) => g.attemptId === attempt.id)
        : [],
    [allGradesRaw, attempt],
  );
  const essayTotals = useMemo(() => {
    let points = 0;
    let max = 0;
    for (const g of essayGrades) {
      points += g.totalPoints;
      max += g.maxPoints;
    }
    return { points, max };
  }, [essayGrades]);

  if (!shift) return notFound();
  if (!attempt) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
        <p className="text-[14px] font-semibold">Chưa có dữ liệu bài làm</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Bạn chưa làm bài hoặc dữ liệu đã bị xoá. Có thể bạn vừa nộp xong —
          thử Refresh trang một lần.
        </p>
        <Link
          href="/my-exams"
          className="mt-4 inline-block text-[12px] font-semibold text-blue-700 hover:underline"
        >
          ← Lịch thi
        </Link>
      </div>
    );
  }

  if (!resultQReady || (useServer && reviewQuestions === null)) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Đang tải kết quả…
      </div>
    );
  }

  const subject = subjects.find((s) => s.id === shift.subjectId);
  const pkg = packages.find((p) => p.id === shift.packageId);
  const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;

  // ───── Score computation honors `shift.scoring` (max + mode).
  // Auto-graded MCQ: full per-question score if correct, 0 otherwise.
  // Essay: rubric ratio × per-question score, with `null` (chưa chấm)
  // treated as 0 for now (the "pending" pill flags this to the student).
  const scoring = shift.scoring ?? DEFAULT_SCORING;
  const questionSource = useServer ? reviewQuestions ?? [] : allQuestions;
  const examQuestions = attempt.questionIds
    .map((qid) => questionSource.find((q) => q.id === qid))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const perQuestionScore = computePerQuestionScores(scoring, examQuestions);
  // Sum of MAX possible across the actually-administered subset. Manual
  // mode may diverge from `scoring.maxScore` because the student only
  // sees a slice of the blueprint pool — display reflects what *this*
  // student could earn.
  const examMaxScore = Object.values(perQuestionScore).reduce(
    (a, n) => a + n,
    0,
  );

  let earnedScore = 0;
  let autoCorrect = 0;
  let autoCorrectMax = 0;
  for (const q of examQuestions) {
    const qScore = perQuestionScore[q.id] ?? 0;
    const ans = attempt.answers[q.id];
    if (q.type === "essay" || q.type === "ai-generated") {
      const grade = essayGrades.find((g) => g.questionId === q.id);
      if (grade) {
        const ratio =
          grade.maxPoints > 0 ? grade.totalPoints / grade.maxPoints : 0;
        earnedScore += ratio * qScore;
      }
      continue;
    }
    autoCorrectMax++;
    if (ans && isCorrect(q, ans)) {
      earnedScore += qScore;
      autoCorrect++;
    }
  }
  // Round earned to 2 decimals for display.
  earnedScore = Math.round(earnedScore * 100) / 100;
  const earnedDisplayMax = Math.round(examMaxScore * 100) / 100;

  // Pending essay count (questions awaiting grader review).
  const pendingEssayCount = attempt.questionIds.filter((qid) => {
    const q = questionSource.find((x) => x.id === qid);
    if (!q) return false;
    if (q.type !== "essay" && q.type !== "ai-generated") return false;
    return !essayGrades.some((g) => g.questionId === qid);
  }).length;
  // Questions counted as wrong = auto-graded the student got incorrect.
  const wrong = Math.max(0, autoCorrectMax - autoCorrect);

  // Convert to 100-scale for the "Giỏi/Khá/..." grade band lookup, since
  // those thresholds are conventionally defined on a /100 scale.
  const scoreOnHundred =
    examMaxScore > 0 ? Math.round((earnedScore / examMaxScore) * 100) : 0;
  const score = earnedScore; // shown next to /{examMaxScore}
  const correct = autoCorrect;
  const maxScore = autoCorrectMax;
  const totalQ = attempt.questionIds.length;
  const grade =
    scoreOnHundred >= 80
      ? { label: "Giỏi", tone: "emerald" }
      : scoreOnHundred >= 65
        ? { label: "Khá", tone: "blue" }
        : scoreOnHundred >= 50
          ? { label: "Trung bình", tone: "amber" }
          : { label: "Chưa đạt", tone: "rose" };
  const toneClass = {
    emerald: "from-emerald-500 to-emerald-700 text-emerald-700",
    blue: "from-blue-500 to-blue-700 text-blue-700",
    amber: "from-amber-500 to-amber-700 text-amber-700",
    rose: "from-rose-500 to-rose-700 text-rose-700",
  }[grade.tone];
  const submittedAt = attempt.submittedAt
    ? new Date(attempt.submittedAt)
    : null;
  const startedAt = new Date(attempt.startedAt);
  const durationSec = submittedAt
    ? Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000)
    : 0;

  // ───── Student-facing visibility policy chosen by the GV at shift
  // creation. "full" mirrors the old behavior; "score-only" trims the
  // per-question detail; "hidden" blocks the entire page until the GV
  // chooses to release it (manual flip in the wizard).
  const visibility = shift.studentResultVisibility ?? DEFAULT_RESULT_VISIBILITY;

  if (visibility === "hidden") {
    return (
      <>
        <Link
          href="/my-exams"
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> Lịch thi
        </Link>
        <section className="mx-auto mt-6 max-w-md rounded-2xl border bg-card p-8 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <EyeOff className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="mt-3 text-[15px] font-semibold">
            Kết quả chưa được công bố
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Giáo viên đã thiết lập <b>ẩn kết quả</b> cho ca thi này. Bạn sẽ
            được xem điểm và chi tiết bài làm sau khi giáo viên cho phép công
            bố.
          </p>
          <p className="mt-3 text-[11.5px] text-muted-foreground">
            Ca thi: <b>{shift.name}</b>
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <Link
        href="/my-exams"
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline"
      >
        <ArrowLeft className="h-3 w-3" /> Lịch thi
      </Link>

      {/* Score hero */}
      <section className="mb-5 rounded-2xl border bg-card p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <Trophy className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="mt-3 text-[14px] font-semibold uppercase tracking-[0.06em] text-foreground/65">
          Kết quả bài thi
        </h1>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          <span
            className={cn(
              "bg-gradient-to-br bg-clip-text text-[64px] font-black leading-none text-transparent",
              toneClass,
            )}
          >
            {formatScore(score)}
          </span>
          <span className="text-[20px] font-bold text-muted-foreground">
            /{formatScore(earnedDisplayMax)}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Quy về thang 100: <b>{scoreOnHundred}/100</b>
          {scoring.mode !== "even" && (
            <>
              {" "}
              · Phân bổ:{" "}
              {scoring.mode === "by-difficulty" ? "theo độ khó" : "thủ công"}
            </>
          )}
        </p>
        <p
          className={cn(
            "mt-2 inline-block rounded-full border px-3 py-1 text-[12px] font-semibold",
            grade.tone === "emerald"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : grade.tone === "blue"
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : grade.tone === "amber"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-rose-300 bg-rose-50 text-rose-800",
          )}
        >
          Xếp loại: {grade.label}
        </p>
        {/* Big "Đúng N · Sai M" pill so the user sees the answer breakdown
            even when the score block looks ambiguous. */}
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đúng: {correct}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-800 ring-1 ring-rose-200">
            <XCircle className="h-3.5 w-3.5" />
            Sai: {wrong}
          </span>
          {pendingEssayCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-800 ring-1 ring-amber-200">
              <Clock className="h-3.5 w-3.5" />
              Chờ GV chấm: {pendingEssayCount}
            </span>
          )}
          {essayTotals.max > 0 && pendingEssayCount === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-800 ring-1 ring-violet-200">
              ✍ Tự luận: {essayTotals.points}/{essayTotals.max}
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Tổng:{" "}
          <span className="font-semibold text-foreground">
            {correct}/{maxScore}
          </span>{" "}
          câu trắc nghiệm tự động
          {essayTotals.max > 0 && (
            <span className="text-violet-700">
              {" · "}
              Tự luận: {essayTotals.points}/{essayTotals.max} điểm rubric
            </span>
          )}
        </p>
        {essayGrades.length > 0 && (
          <p className="mt-2 text-[11.5px] text-emerald-700">
            ✓ Đã có {essayGrades.length} câu được chấm. Điểm tổng đã cập nhật.
          </p>
        )}
      </section>

      {/* Meta */}
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetaCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="THỜI GIAN LÀM"
          value={formatDuration(durationSec)}
        />
        <MetaCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="CÂU ĐÚNG"
          value={`${correct}/${maxScore || totalQ}`}
        />
        <MetaCard
          icon={<XCircle className="h-3.5 w-3.5" />}
          label="VI PHẠM ANTI-CHEAT"
          value={String(
            attempt.violations.tabSwitches +
              attempt.violations.fullscreenExits +
              attempt.violations.pasteAttempts,
          )}
        />
      </section>

      {/* Detail per question — hidden when GV chose score-only. */}
      {visibility === "score-only" && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-[12.5px] text-amber-800">
          <EyeOff className="mx-auto mb-1 h-4 w-4" />
          Giáo viên chỉ công bố <b>điểm tổng</b> cho ca thi này. Chi tiết từng
          câu sẽ không được hiển thị.
        </section>
      )}
      {visibility === "full" && (
      <section className="rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-[14px] font-semibold">Chi tiết theo câu</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {shift.name} · {subject?.name ?? "—"}
            {bp && (
              <span className="ml-1 text-muted-foreground">
                · Khung: {bp.name}
              </span>
            )}
          </p>
        </header>
        <ul className="divide-y">
          {attempt.questionIds.map((qid, idx) => {
            const q = questionSource.find((x) => x.id === qid);
            const ans = attempt.answers[qid];
            const isManual =
              q && (q.type === "essay" || q.type === "ai-generated");
            const grade = isManual
              ? essayGrades.find((g) => g.questionId === qid)
              : undefined;
            const correctnessIcon = !q ? (
              <Circle className="h-4 w-4 text-muted-foreground" />
            ) : isManual ? (
              grade ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800"
                  title={`Chấm bởi ${grade.graderName}`}
                >
                  {grade.totalPoints}/{grade.maxPoints}
                </span>
              ) : (
                <Clock className="h-4 w-4 text-amber-600" />
              )
            ) : ans ? (
              isCorrect(q, ans) ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600" />
              )
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            );
            const qScore = q ? perQuestionScore[q.id] ?? 0 : 0;
            return (
              <li
                key={qid}
                className="flex items-start gap-3 px-5 py-3 hover:bg-accent/20"
              >
                <span className="mt-0.5 w-6 text-right text-[12px] font-semibold text-foreground/65">
                  {idx + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  {/* Render via RenderedContent so authored markers
                      (![alt](url) images, math, [u:...] underline) display
                      correctly. `hideUnderlineMarks` strips the underline
                      authoring markers so students don't see the answer
                      hint leak through on the result page. */}
                  {q ? (
                    <RenderedContent
                      content={q.content}
                      className="text-[13px] leading-snug"
                      hideUnderlineMarks
                    />
                  ) : (
                    <p className="text-[13px] italic text-muted-foreground">
                      (Câu hỏi không tồn tại: {qid})
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold">
                      Điểm câu: {formatScore(qScore)} đ
                    </span>
                    {grade && grade.comment && (
                      <span className="italic">
                        💬 {grade.graderName}: {grade.comment}
                      </span>
                    )}
                  </div>
                </div>
                {correctnessIcon}
              </li>
            );
          })}
        </ul>
      </section>
      )}
    </>
  );
}

/** Mirror the grading rules from attempts-store.ts (read-only here). */
function isCorrect(
  q: ReturnType<typeof useQuestionsStore.getState>["questions"][number],
  a: NonNullable<
    ReturnType<typeof useAttemptsStore.getState>["attempts"][number]["answers"][string]
  >,
): boolean {
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

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className="mt-0.5 text-[20px] font-bold leading-none">{value}</div>
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
