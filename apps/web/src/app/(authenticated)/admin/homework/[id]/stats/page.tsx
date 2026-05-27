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

      {/* Per-question chart */}
      <section className="mb-5 rounded-xl border bg-card p-4">
        <p className="mb-3 text-section-title">% HS đúng từng câu</p>
        {submitted === 0 ? (
          <p className="text-meta">Chưa có HS nộp bài để thống kê.</p>
        ) : (
          <div className="space-y-2">
            {perQuestionStats.map((row, idx) => {
              const pct =
                row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
              const barColor =
                pct >= 70
                  ? "bg-emerald-500"
                  : pct >= 40
                    ? "bg-amber-500"
                    : "bg-rose-500";
              return (
                <div key={row.question.id} className="space-y-0.5">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-medium">
                      Câu {idx + 1}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {plainText(row.question.content).slice(0, 80)}
                      </span>
                    </span>
                    <span className="text-foreground/70">
                      {row.correct}/{row.total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Per-student table */}
      <section className="rounded-xl border bg-card">
        <p className="border-b px-4 py-3 text-section-title">Chi tiết theo HS</p>
        <div className="divide-y">
          {studentRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-meta">
              Lớp được giao chưa có HS nào. Kiểm tra lại danh sách lớp.
            </p>
          ) : (
            studentRows.map((row) => {
              const submittedAt = row.attempt?.submittedAt;
              const score = row.attempt?.correctCount ?? null;
              const totalQ = row.attempt?.totalQuestions ?? questions.length;
              const pct =
                score != null && totalQ > 0
                  ? Math.round((score / totalQ) * 100)
                  : null;
              return (
                <button
                  key={row.studentId}
                  type="button"
                  onClick={() => setDetailStudentId(row.studentId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/15"
                  title="Xem chi tiết bài làm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{row.name}</p>
                    <p className="text-meta truncate">{row.username}</p>
                  </div>
                  {submittedAt ? (
                    <>
                      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                        Đã nộp
                      </span>
                      <span className="font-mono text-[12.5px]">
                        {score}/{totalQ}
                      </span>
                      <span className="text-meta">{pct}%</span>
                    </>
                  ) : (
                    <span className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-600">
                      Chưa nộp
                    </span>
                  )}
                  <Eye className="ml-1 h-4 w-4 text-muted-foreground" />
                </button>
              );
            })
          )}
        </div>
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
