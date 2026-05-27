"use client";

import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { isCorrect } from "@/features/shift-exam/lib/is-correct";
import { PageHeader } from "@/features/shell/components/page-header";

import type { HomeworkAttempt } from "@/features/homework/data/types";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";

const HomeworkAttemptDetailDialog = dynamic(
  () =>
    import(
      "@/features/homework/dialogs/homework-attempt-detail-dialog"
    ).then((m) => m.HomeworkAttemptDetailDialog),
  { ssr: false, loading: () => null },
);

const ViewQuestionDialog = dynamic(
  () =>
    import("@/features/question-bank/dialogs/view-question-dialog").then(
      (m) => m.ViewQuestionDialog,
    ),
  { ssr: false, loading: () => null },
);

export default function HomeworkStatsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const homework = useHomeworkStore((s) => s.findById(id));
  const homeworkHydrated = useHomeworkStore((s) => s.hydrated);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const attempts = useHomeworkAttemptsStore((s) => s.attempts);
  const users = useUsersStore((s) => s.users);
  const allClasses = useGradesStore((s) => s.classes);

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<
    (typeof allQuestions)[number] | null
  >(null);

  if (!homework) {
    if (!homeworkHydrated) {
      return (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Đang tải BTVN…
        </div>
      );
    }
    return notFound();
  }

  const questions = homework.questionIds
    .map((qid) => allQuestions.find((q) => q.id === qid))
    .filter((q): q is NonNullable<typeof q> => !!q);

  // Build per-student stats
  const myAttempts = attempts.filter((a) => a.homeworkId === id);

  // Roster: respect per-student override if set, else fall back to
  // "every student in assigned classes".
  const rosterIds = useMemo(() => {
    if (homework.studentIds && homework.studentIds.length > 0) {
      return homework.studentIds.slice();
    }
    const ids = new Set<string>();
    for (const cid of homework.classIds) {
      const cls = allClasses.find((c) => c.id === cid);
      const studentIds =
        (cls as { studentIds?: string[] } | undefined)?.studentIds ?? [];
      for (const sid of studentIds) ids.add(sid);
    }
    return [...ids];
  }, [homework.classIds, homework.studentIds, allClasses]);

  const studentRows = rosterIds
    .map((sid) => {
      const user = users.find((u) => u.id === sid);
      const att = myAttempts.find((a) => a.studentId === sid);
      return {
        studentId: sid,
        name: user?.name ?? sid,
        username: user?.username ?? user?.email ?? "",
        attempt: att,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
    );

  const submitted = studentRows.filter((r) => r.attempt?.submittedAt).length;
  const total = studentRows.length;
  const avgPercent =
    submitted > 0
      ? Math.round(
          (studentRows.reduce((acc, r) => {
            if (!r.attempt?.submittedAt) return acc;
            const pct =
              r.attempt.totalQuestions && r.attempt.totalQuestions > 0
                ? (r.attempt.correctCount ?? 0) / r.attempt.totalQuestions
                : 0;
            return acc + pct;
          }, 0) /
            submitted) *
            100,
        )
      : 0;

  // Per-question correctness: % of submitted students who got each right.
  const perQuestionStats = questions.map((q) => {
    const submittedAttempts = myAttempts.filter((a) => a.submittedAt != null);
    const correct = submittedAttempts.filter((a) => {
      const ans = a.answers[q.id];
      return ans ? isCorrect(q, ans) : false;
    }).length;
    return {
      question: q,
      correct,
      total: submittedAttempts.length,
    };
  });

  return (
    <>
      <PageHeader
        title={`Thống kê: ${homework.title}`}
        description={`${homework.classIds.length} lớp · ${questions.length} câu · hạn nộp ${homework.dueAt}`}
        actions={
          <Link
            href="/admin/homework"
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2 text-[12px] font-medium hover:bg-accent/30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại
          </Link>
        }
      />

      {/* KPIs */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="HS được giao" value={`${total}`} />
        <KpiTile label="Đã nộp" value={`${submitted}`} tone="emerald" />
        <KpiTile label="Chưa nộp" value={`${total - submitted}`} tone="amber" />
        <KpiTile label="Trung bình đúng" value={`${avgPercent}%`} tone="blue" />
      </section>

      {/* Per-student section moved ABOVE per-question — mirrors the
          exam reports detail layout. */}
      <section className="mb-5 rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-section-title">👥 Bảng điểm HS</h2>
          <p className="text-meta mt-0.5">
            Click vào HS để xem bài làm chi tiết đúng/sai từng câu.
          </p>
        </header>
        {studentRows.length === 0 ? (
          <p className="px-5 py-6 text-center text-meta">
            Lớp được giao chưa có HS nào. Kiểm tra lại danh sách lớp.
          </p>
        ) : (
          <ul className="divide-y">
            {studentRows
              .slice()
              .sort((a, b) => {
                // Submitted first, then by score descending.
                const aSub = a.attempt?.submittedAt ? 1 : 0;
                const bSub = b.attempt?.submittedAt ? 1 : 0;
                if (aSub !== bSub) return bSub - aSub;
                const aPct =
                  a.attempt?.totalQuestions
                    ? (a.attempt.correctCount ?? 0) / a.attempt.totalQuestions
                    : 0;
                const bPct =
                  b.attempt?.totalQuestions
                    ? (b.attempt.correctCount ?? 0) / b.attempt.totalQuestions
                    : 0;
                return bPct - aPct;
              })
              .map((row, idx) => {
                const submittedAt = row.attempt?.submittedAt;
                const score = row.attempt?.correctCount ?? null;
                const totalQ =
                  row.attempt?.totalQuestions ?? questions.length;
                const pct =
                  score != null && totalQ > 0
                    ? Math.round((score / totalQ) * 100)
                    : null;
                const tone =
                  pct == null
                    ? "muted"
                    : pct >= 75
                      ? "emerald"
                      : pct >= 50
                        ? "blue"
                        : pct >= 25
                          ? "amber"
                          : "rose";
                return (
                  <li key={row.studentId}>
                    <button
                      type="button"
                      onClick={() => setDetailStudentId(row.studentId)}
                      className="grid w-full items-center gap-3 px-5 py-2 text-left hover:bg-accent/20 sm:grid-cols-[28px_minmax(0,1fr)_100px_70px_44px]"
                      title="Xem chi tiết bài làm"
                    >
                      <span className="text-right text-[11px] font-semibold text-foreground/65">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold">
                          {row.name}
                        </p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {row.username}
                        </p>
                      </div>
                      <span
                        className={`text-center text-[14px] font-bold ${
                          tone === "emerald"
                            ? "text-emerald-700"
                            : tone === "blue"
                              ? "text-blue-700"
                              : tone === "amber"
                                ? "text-amber-700"
                                : tone === "rose"
                                  ? "text-rose-700"
                                  : "text-muted-foreground"
                        }`}
                      >
                        {submittedAt ? (
                          <>
                            {score}
                            <span className="text-[10.5px] font-normal text-muted-foreground">
                              /{totalQ}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      {submittedAt ? (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-center text-[10.5px] font-semibold uppercase ${
                            tone === "emerald"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : tone === "blue"
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : tone === "amber"
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-rose-300 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {pct}%
                        </span>
                      ) : (
                        <span className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-center text-[10.5px] font-semibold uppercase text-zinc-600">
                          Chưa nộp
                        </span>
                      )}
                      <span className="text-center text-[11.5px] font-semibold text-blue-700 hover:underline">
                        Xem →
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Per-question detail — compact rows with eye icon to inspect
          full question content. Hardest first. */}
      <section className="mb-5 rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-section-title">📝 Chi tiết theo câu hỏi</h2>
          <p className="text-meta mt-0.5">
            % HS trả lời đúng. Click{" "}
            <Eye className="mx-1 inline h-3 w-3" /> để xem chi tiết câu hỏi.
          </p>
        </header>
        {submitted === 0 ? (
          <p className="px-5 py-6 text-center text-[12px] text-muted-foreground">
            Chưa có HS nộp bài để thống kê.
          </p>
        ) : (
          <ul className="divide-y">
            {perQuestionStats
              .slice()
              .sort((a, b) => {
                // Hardest first.
                const ap =
                  a.total > 0 ? a.correct / a.total : 0.5;
                const bp =
                  b.total > 0 ? b.correct / b.total : 0.5;
                return ap - bp;
              })
              .map((row, idx) => {
                const pct =
                  row.total > 0
                    ? Math.round((row.correct / row.total) * 100)
                    : 0;
                const wrong = row.total - row.correct;
                const tone =
                  pct >= 75
                    ? "emerald"
                    : pct >= 50
                      ? "blue"
                      : pct >= 25
                        ? "amber"
                        : "rose";
                return (
                  <li
                    key={row.question.id}
                    className="grid items-center gap-2 px-4 py-1.5 hover:bg-accent/20 sm:grid-cols-[28px_minmax(0,1fr)_140px_60px_28px]"
                  >
                    <span className="text-right text-[11px] font-semibold text-foreground/60">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full border px-1.5 text-[9.5px] font-bold uppercase ${
                            row.question.difficulty === "easy"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.question.difficulty === "medium"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {row.question.difficulty === "easy"
                            ? "Dễ"
                            : row.question.difficulty === "medium"
                              ? "TB"
                              : "Khó"}
                        </span>
                        <span className="line-clamp-1 text-[12px] leading-snug text-foreground/85">
                          {plainText(row.question.content)}
                        </span>
                      </div>
                    </div>
                    <div
                      className="flex h-3 overflow-hidden rounded-full bg-muted/60"
                      title={`Đúng ${row.correct} · Sai ${wrong} / ${row.total}`}
                    >
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${(row.correct / Math.max(1, row.total)) * 100}%`,
                        }}
                      />
                      <div
                        className="h-full bg-rose-500"
                        style={{
                          width: `${(wrong / Math.max(1, row.total)) * 100}%`,
                        }}
                      />
                    </div>
                    <div
                      className={`rounded-md border px-1.5 py-0.5 text-center text-[13px] font-bold ${
                        tone === "emerald"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : tone === "blue"
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : tone === "amber"
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-rose-300 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {pct}%
                    </div>
                    <button
                      type="button"
                      onClick={() => setReviewing(row.question)}
                      title="Xem chi tiết câu hỏi"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <HomeworkAttemptDetailDialog
        open={detailStudentId != null}
        onOpenChange={(o) => !o && setDetailStudentId(null)}
        studentName={
          studentRows.find((r) => r.studentId === detailStudentId)?.name ?? ""
        }
        studentUsername={
          studentRows.find((r) => r.studentId === detailStudentId)?.username
        }
        attempt={
          (detailStudentId
            ? studentRows.find((r) => r.studentId === detailStudentId)
                ?.attempt ?? null
            : null) as HomeworkAttempt | null
        }
        questions={questions}
      />

      <ViewQuestionDialog
        question={reviewing}
        onClose={() => setReviewing(null)}
      />
    </>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "blue";
}) {
  const toneClass: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return (
    <div
      className={`rounded-xl border bg-card p-4 ${tone ? toneClass[tone] : ""}`}
    >
      <p className="text-meta">{label}</p>
      <p className="mt-1 text-[24px] font-bold">{value}</p>
    </div>
  );
}

function plainText(s: string): string {
  return s
    .replace(/!\[.*?\]\(.*?\)/g, "[ảnh]")
    .replace(/\[u:([^\]]+)\]/g, "$1")
    .replace(/\[zone:\d+\]/g, "___")
    .replace(/\s+/g, " ")
    .trim();
}
