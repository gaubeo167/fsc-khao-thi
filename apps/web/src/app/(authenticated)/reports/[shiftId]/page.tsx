"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Hourglass,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { DEFAULT_SCORING } from "@/features/exam-shifts/data/types";
import { formatScore } from "@/features/exam-shifts/lib/scoring";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { ViewQuestionDialog } from "@/features/question-bank/dialogs/view-question-dialog";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import {
  SEVERITY_META,
  generateInsights,
} from "@/features/reports/lib/ai-insights";
import {
  buildShiftReport,
  type GradeBand,
} from "@/features/reports/lib/compute-stats";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

export default function ReportDetailPage() {
  const params = useParams<{ shiftId: string }>();
  const shiftId = params.shiftId;
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const shift = useShiftsStore((s) => s.shifts.find((x) => x.id === shiftId));
  const attempts = useAttemptsStore((s) => s.attempts);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const users = useUsersStore((s) => s.users);
  const essayGradesAll = useGradingStore((s) => s.grades);

  const report = useMemo(() => {
    if (!shift) return null;
    // Resolve pool + eligibility.
    const pkg = packages.find((p) => p.id === shift.packageId);
    const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
    const poolIds = bp ? bp.topics.flatMap((t) => t.pickedQuestionIds) : [];
    const pool = poolIds
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q);
    const explicitIds = new Set(
      shift.rooms.flatMap((r) => r.studentIds ?? []),
    );
    let eligible = explicitIds.size;
    if (eligible === 0) {
      const codes = new Set(
        allClasses
          .filter((c) => shift.classIds.includes(c.id))
          .map((c) => c.code),
      );
      eligible = users.filter(
        (u) =>
          u.role === "student" &&
          u.status === "active" &&
          u.campusId === shift.campusId &&
          u.className != null &&
          codes.has(u.className),
      ).length;
    }
    const shiftAttempts = attempts.filter((a) => a.shiftId === shift.id);
    return buildShiftReport({
      shift,
      attempts: shiftAttempts,
      questions: pool,
      essayGrades: essayGradesAll.filter((g) => g.shiftId === shift.id),
      eligible,
    });
  }, [
    shift,
    attempts,
    allQuestions,
    packages,
    blueprints,
    allClasses,
    users,
    essayGradesAll,
  ]);

  const insights = useMemo(
    () => (report ? generateInsights(report) : []),
    [report],
  );

  // Which question the teacher clicked the eye icon on — drives the
  // review dialog showing full content, options, correct answer, etc.
  const [reviewing, setReviewing] = useState<Question | null>(null);

  if (!shift) return notFound();
  if (campusId && shift.campusId !== campusId) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Ca thi không thuộc campus đang chọn.
      </div>
    );
  }
  // Subject + grade scope gate — teacher cannot URL-navigate to a
  // report outside their assigned môn/khối. Admin-class roles bypass.
  if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
    const outOfSubject = !scope.allowedSubjectIds.has(shift.subjectId);
    const outOfGrade =
      scope.allowedGradeIds != null &&
      !scope.allowedGradeIds.has(shift.gradeId);
    if (outOfSubject || outOfGrade) {
      return (
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
          <p className="text-[14px] font-semibold">
            🔒 Bạn không có quyền xem báo cáo này
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Ca thi này thuộc môn / khối không nằm trong phạm vi bạn được
            giao quản lý. Liên hệ Admin campus để mở rộng phạm vi nếu
            thực sự cần.
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
  if (!report) return null;

  const subject = subjects.find((s) => s.id === shift.subjectId);
  const grade = grades.find((g) => g.id === shift.gradeId);
  const scoring = shift.scoring ?? DEFAULT_SCORING;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card px-5 py-4">
        <Link
          href="/reports"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12px] font-semibold hover:bg-accent/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Báo cáo
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
              {shift.id}
            </span>
            {subject && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                {subject.name}
              </span>
            )}
            {grade && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
                {grade.code}
              </span>
            )}
          </div>
          <h1 className="mt-1 truncate text-[18px] font-bold leading-tight">
            {shift.name}
          </h1>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {new Date(shift.startAt).toLocaleString("vi-VN")} →{" "}
            {new Date(shift.endAt).toLocaleString("vi-VN")} · Thang điểm:{" "}
            <b>{formatScore(scoring.maxScore)}</b> đ · Phân bổ:{" "}
            <b>
              {scoring.mode === "even"
                ? "Chia đều"
                : scoring.mode === "by-difficulty"
                  ? "Theo độ khó"
                  : "Thủ công"}
            </b>
          </p>
        </div>
      </div>

      {/* AI insights — surface at the very top so teacher reads them first */}
      {insights.length > 0 && (
        <section className="rounded-2xl border-2 border-violet-200 bg-violet-50/30 px-5 py-4">
          <h2 className="text-section-title inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            AI nhận định ({insights.length})
          </h2>
          <p className="text-meta mt-0.5">
            Gợi ý theo dữ liệu thực tế của ca thi. Click vào từng điểm để xem
            chi tiết.
          </p>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {insights.map((ins) => {
              const meta = SEVERITY_META[ins.severity];
              return (
                <li
                  key={ins.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border-l-4 px-3 py-2.5",
                    meta.tone,
                  )}
                >
                  <span className="text-base leading-none">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold">
                      {ins.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug opacity-90">
                      {ins.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="HS ĐÃ NỘP"
          value={`${report.totals.submitted}/${report.totals.eligible}`}
          tone="blue"
        />
        <KpiTile
          icon={<Trophy className="h-4 w-4" />}
          label="ĐIỂM TRUNG BÌNH"
          value={`${formatScore(report.totals.avgRaw)}`}
          hint={`/ ${formatScore(scoring.maxScore)} (${report.totals.avgPercent}/100)`}
          tone="emerald"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="TỈ LỆ ĐẠT"
          value={`${report.totals.passRate}%`}
          hint="≥ 50/100"
          tone={
            report.totals.passRate >= 70
              ? "emerald"
              : report.totals.passRate >= 50
                ? "blue"
                : "amber"
          }
        />
        <KpiTile
          icon={<Hourglass className="h-4 w-4" />}
          label="THỜI GIAN TB"
          value={
            report.totals.avgDurationMin != null
              ? `${report.totals.avgDurationMin}p`
              : "—"
          }
          tone="violet"
        />
        <KpiTile
          icon={<ShieldAlert className="h-4 w-4" />}
          label="VI PHẠM"
          value={report.totals.totalViolations}
          tone={report.totals.totalViolations > 0 ? "rose" : "muted"}
        />
        <KpiTile
          icon={<XCircle className="h-4 w-4" />}
          label="VẮNG"
          value={report.totals.absent}
          tone={report.totals.absent > 0 ? "amber" : "muted"}
        />
      </section>

      {/* Distribution chart */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-section-title mb-3">📊 Phân bố điểm</h2>
        {report.totals.submitted === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Chưa có bài làm để phân tích.
          </p>
        ) : (
          <DistributionChart distribution={report.distribution} />
        )}
      </section>

      {/* Per-question detail */}
      <section className="rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-section-title">📝 Chi tiết theo câu hỏi</h2>
          <p className="text-meta mt-0.5">
            % HS trả lời đúng (auto) hoặc đạt ≥ 50% rubric (tự luận).
          </p>
        </header>
        {report.perQuestion.length === 0 ? (
          <p className="px-5 py-6 text-center text-[12px] text-muted-foreground">
            Bộ đề chưa có câu hỏi nào trong pool blueprint.
          </p>
        ) : (
          <ul className="divide-y">
            {report.perQuestion
              .filter((row) => row.totalAssigned > 0)
              .sort((a, b) => {
                // Hardest questions to the top.
                const ap = a.correctPercent ?? 50;
                const bp = b.correctPercent ?? 50;
                return ap - bp;
              })
              .map((row, idx) => {
                const pct = row.correctPercent ?? 0;
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
                    className="grid items-center gap-3 px-5 py-3 hover:bg-accent/20 sm:grid-cols-[40px_minmax(0,1fr)_180px_120px_44px]"
                  >
                    <span className="text-right text-[11px] font-semibold text-foreground/65">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0 text-[9.5px] font-bold uppercase",
                            row.difficulty === "easy"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.difficulty === "medium"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-rose-200 bg-rose-50 text-rose-700",
                          )}
                        >
                          {row.difficulty === "easy"
                            ? "Dễ"
                            : row.difficulty === "medium"
                              ? "TB"
                              : "Khó"}
                        </span>
                        {row.isManual && (
                          <span className="rounded-full bg-violet-100 px-1.5 py-0 text-[9.5px] font-bold text-violet-700">
                            Tự luận
                          </span>
                        )}
                        <span className="rounded bg-muted px-1 text-[9.5px] font-semibold text-foreground/65">
                          {formatScore(row.weight)} đ
                        </span>
                      </div>
                      <RenderedContent
                        content={row.question.content}
                        hideUnderlineMarks
                        className="text-[12.5px] leading-snug line-clamp-2"
                      />
                    </div>
                    {/* Bar visualisation */}
                    <div className="w-full">
                      <div className="flex h-3 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: `${(row.correct / Math.max(1, row.totalAssigned)) * 100}%`,
                          }}
                          title={`Đúng: ${row.correct}`}
                        />
                        <div
                          className="h-full bg-rose-500"
                          style={{
                            width: `${(row.wrong / Math.max(1, row.totalAssigned)) * 100}%`,
                          }}
                          title={`Sai: ${row.wrong}`}
                        />
                        <div
                          className="h-full bg-slate-300"
                          style={{
                            width: `${(row.blank / Math.max(1, row.totalAssigned)) * 100}%`,
                          }}
                          title={`Bỏ trống/Chưa chấm: ${row.blank}`}
                        />
                      </div>
                      <p className="mt-1 text-[10.5px] text-muted-foreground">
                        Đúng {row.correct} · Sai {row.wrong} · Bỏ trống{" "}
                        {row.blank} / {row.totalAssigned}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-center",
                        tone === "emerald"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : tone === "blue"
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : tone === "amber"
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-rose-300 bg-rose-50 text-rose-800",
                      )}
                    >
                      <p className="text-[18px] font-bold leading-none">
                        {pct}%
                      </p>
                      <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.06em]">
                        {row.isManual ? "Đạt ≥ 50% rubric" : "Đúng"}
                      </p>
                    </div>
                    {/* Eye icon — opens the full ViewQuestionDialog so the
                        teacher can read prompt, options, correct answer,
                        explanation, etc. The list above only renders a
                        2-line truncated preview to keep the row compact. */}
                    <button
                      type="button"
                      onClick={() => setReviewing(row.question)}
                      title="Xem chi tiết câu hỏi (đề + đáp án + giải thích)"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Per-student table */}
      <section className="rounded-2xl border bg-card">
        <header className="border-b px-5 py-3">
          <h2 className="text-section-title">👥 Bảng điểm HS</h2>
          <p className="text-meta mt-0.5">
            Sort theo điểm giảm dần. Click "Xem" để mở kết quả chi tiết của
            HS đó.
          </p>
        </header>
        {report.perStudent.length === 0 ? (
          <p className="px-5 py-6 text-center text-[12px] text-muted-foreground">
            Chưa có HS nào nộp bài.
          </p>
        ) : (
          <ul className="divide-y">
            {[...report.perStudent]
              .sort((a, b) => b.percent - a.percent)
              .map((row, idx) => {
                const stu = users.find((u) => u.id === row.attempt.studentId);
                return (
                  <li
                    key={row.attempt.id}
                    className="grid items-center gap-3 px-5 py-2.5 hover:bg-accent/20 sm:grid-cols-[40px_minmax(0,1fr)_100px_80px_70px]"
                  >
                    <span className="text-right text-[11px] font-semibold text-foreground/65">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold">
                        {stu?.name ?? row.attempt.studentId}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">
                        Lớp {stu?.className ?? "—"} · Đúng {row.correctCount}/
                        {row.autoMax} · {row.durationMin ?? "—"}p
                        {row.violations > 0 && (
                          <span className="ml-2 text-rose-700">
                            ⚠ {row.violations} vi phạm
                          </span>
                        )}
                        {row.pendingEssay > 0 && (
                          <span className="ml-2 text-violet-700">
                            🕒 {row.pendingEssay} câu chờ chấm
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-center text-[15px] font-bold",
                        row.band === "Giỏi"
                          ? "text-emerald-700"
                          : row.band === "Khá"
                            ? "text-blue-700"
                            : row.band === "Trung bình"
                              ? "text-amber-700"
                              : "text-rose-700",
                      )}
                    >
                      {formatScore(row.raw)}
                      <span className="text-[10.5px] font-normal text-muted-foreground">
                        /{formatScore(scoring.maxScore)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-center text-[10.5px] font-semibold uppercase",
                        row.band === "Giỏi"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : row.band === "Khá"
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : row.band === "Trung bình"
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-rose-300 bg-rose-50 text-rose-800",
                      )}
                    >
                      {row.band}
                    </span>
                    <Link
                      href={`/reports/${shift.id}/attempts/${row.attempt.id}`}
                      className="text-center text-[11.5px] font-semibold text-blue-700 hover:underline"
                    >
                      Xem →
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Review dialog (per question detail). Opens when the eye icon is
          clicked above; uses the same dialog the question bank uses for
          consistency so authors and graders see identical content. */}
      <ViewQuestionDialog
        question={reviewing}
        onClose={() => setReviewing(null)}
      />
    </div>
  );
}

function DistributionChart({
  distribution,
}: {
  distribution: Array<{ band: GradeBand; count: number; percent: number }>;
}) {
  const tones: Record<GradeBand, string> = {
    "Giỏi": "bg-emerald-500",
    "Khá": "bg-blue-500",
    "Trung bình": "bg-amber-500",
    "Chưa đạt": "bg-rose-500",
  };
  const max = Math.max(1, ...distribution.map((d) => d.count));
  return (
    <div className="grid grid-cols-4 gap-3">
      {distribution.map((d) => (
        <div
          key={d.band}
          className="flex flex-col items-center justify-end rounded-lg border bg-card px-3 py-3"
        >
          <div className="relative flex h-24 w-full items-end">
            <div
              className={cn("w-full rounded-md transition-all", tones[d.band])}
              style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }}
            />
          </div>
          <p className="mt-2 text-[18px] font-bold leading-none">{d.count}</p>
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {d.band}
          </p>
          <p className="mt-0.5 text-[10.5px] font-semibold">{d.percent}%</p>
        </div>
      ))}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "violet" | "emerald" | "amber" | "rose" | "muted";
}) {
  const tones = {
    blue: "text-blue-700",
    violet: "text-violet-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    muted: "text-foreground",
  } as const;
  return (
    <div className="rounded-xl border bg-card px-3 py-3">
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          tones[tone],
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[20px] font-bold leading-none", tones[tone])}>
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
