"use client";

import {
  ArrowRight,
  CheckCircle2,
  ClipboardEdit,
  Clock,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { isManualGradingType, gradingCode } from "@/features/grading/lib/utils";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

type QueueFilter = "pending" | "done" | "all";

export default function GradingQueuePage() {
  const session = useAuthStore((s) => s.session);
  const shifts = useShiftsStore((s) => s.shifts);
  const assignments = useGradingStore((s) => s.assignments);
  const grades = useGradingStore((s) => s.grades);
  const attempts = useAttemptsStore((s) => s.attempts);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);

  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [search, setSearch] = useState("");
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  /**
   * Per-attempt rows the current grader is responsible for. Each row is
   * a single (attempt, blueprint) pair — one student's bundle of essay
   * questions for one shift.
   *
   * STUDENT IDENTITY IS HIDDEN. The grader sees only:
   *   - `code` (deterministic per shift+student, stable across reloads)
   *   - Shift / subject / submission time / question count
   *
   * The real `studentId` is preserved on the grade record so audits +
   * the reveal-after-grading flow can de-anonymise later.
   */
  const rows = useMemo(() => {
    if (!session) return [];
    const myShiftIds = new Set(
      assignments
        .filter((a) => a.graderId === session.userId)
        .map((a) => a.shiftId),
    );
    const out: Array<{
      attemptId: string;
      shiftId: string;
      shiftName: string;
      subjectName: string;
      code: string;
      submittedAt: string;
      essayCount: number;
      gradedCount: number;
    }> = [];
    for (const shift of shifts) {
      if (!myShiftIds.has(shift.id)) continue;
      const pkg = packages.find((p) => p.id === shift.packageId);
      const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
      if (!bp) continue;
      const pickedIds = new Set(bp.topics.flatMap((t) => t.pickedQuestionIds));
      const manualQs = allQuestions.filter(
        (q) => pickedIds.has(q.id) && isManualGradingType(q.type),
      );
      if (manualQs.length === 0) continue;
      const subjectName =
        subjects.find((s) => s.id === shift.subjectId)?.name ?? "—";
      for (const att of attempts) {
        if (att.shiftId !== shift.id || att.submittedAt == null) continue;
        const essayIdsInAttempt = manualQs
          .filter((q) => att.questionIds.includes(q.id))
          .map((q) => q.id);
        if (essayIdsInAttempt.length === 0) continue;
        const graded = essayIdsInAttempt.filter((qid) =>
          grades.some(
            (g) => g.attemptId === att.id && g.questionId === qid,
          ),
        ).length;
        out.push({
          attemptId: att.id,
          shiftId: shift.id,
          shiftName: shift.name,
          subjectName,
          code: gradingCode(shift.id, att.studentId),
          submittedAt: att.submittedAt!,
          essayCount: essayIdsInAttempt.length,
          gradedCount: graded,
        });
      }
    }
    return out;
  }, [
    session,
    assignments,
    shifts,
    packages,
    blueprints,
    allQuestions,
    attempts,
    subjects,
    grades,
  ]);

  // Group by shift for the visual list.
  type ShiftGroup = {
    shiftId: string;
    shiftName: string;
    subjectName: string;
    submittedRange: { earliest: string; latest: string };
    totalAttempts: number;
    pendingAttempts: number;
    essayTotal: number;
    gradedTotal: number;
    items: typeof rows;
  };
  const groups: ShiftGroup[] = useMemo(() => {
    const map = new Map<string, ShiftGroup>();
    for (const r of rows) {
      const cur = map.get(r.shiftId);
      if (cur) {
        cur.items.push(r);
        cur.totalAttempts++;
        if (r.gradedCount < r.essayCount) cur.pendingAttempts++;
        cur.essayTotal += r.essayCount;
        cur.gradedTotal += r.gradedCount;
        if (new Date(r.submittedAt) < new Date(cur.submittedRange.earliest))
          cur.submittedRange.earliest = r.submittedAt;
        if (new Date(r.submittedAt) > new Date(cur.submittedRange.latest))
          cur.submittedRange.latest = r.submittedAt;
      } else {
        map.set(r.shiftId, {
          shiftId: r.shiftId,
          shiftName: r.shiftName,
          subjectName: r.subjectName,
          submittedRange: { earliest: r.submittedAt, latest: r.submittedAt },
          totalAttempts: 1,
          pendingAttempts: r.gradedCount < r.essayCount ? 1 : 0,
          essayTotal: r.essayCount,
          gradedTotal: r.gradedCount,
          items: [r],
        });
      }
    }
    const arr = Array.from(map.values());
    // Pending shifts first, then by most recent submission desc.
    arr.sort((a, b) => {
      if (a.pendingAttempts > 0 !== b.pendingAttempts > 0)
        return a.pendingAttempts > 0 ? -1 : 1;
      return (
        new Date(b.submittedRange.latest).getTime() -
        new Date(a.submittedRange.latest).getTime()
      );
    });
    return arr;
  }, [rows]);

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        items: g.items
          .filter((r) => {
            const isPending = r.gradedCount < r.essayCount;
            if (filter === "pending" && !isPending) return false;
            if (filter === "done" && isPending) return false;
            if (search.trim()) {
              const q = search.trim().toLowerCase();
              if (
                !r.code.toLowerCase().includes(q) &&
                !r.shiftName.toLowerCase().includes(q) &&
                !r.subjectName.toLowerCase().includes(q)
              )
                return false;
            }
            return true;
          })
          .sort(
            (a, b) =>
              new Date(b.submittedAt).getTime() -
              new Date(a.submittedAt).getTime(),
          ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, filter, search]);

  const kpis = useMemo(() => {
    const totalShifts = groups.length;
    const pendingShifts = groups.filter((g) => g.pendingAttempts > 0).length;
    const totalAttempts = rows.length;
    const pendingAttempts = rows.filter(
      (r) => r.gradedCount < r.essayCount,
    ).length;
    const totalEssays = rows.reduce((a, r) => a + r.essayCount, 0);
    const gradedEssays = rows.reduce((a, r) => a + r.gradedCount, 0);
    return {
      totalShifts,
      pendingShifts,
      totalAttempts,
      pendingAttempts,
      totalEssays,
      gradedEssays,
    };
  }, [groups, rows]);

  if (!session) return null;
  if (!["teacher", "subject-lead", "campus-admin", "academic-director"].includes(
    session.role,
  )) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này dành cho giáo viên / TBM được phân công chấm.
      </div>
    );
  }

  function toggleShift(id: string) {
    setExpandedShifts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Chấm bài tự luận"
        description="Các ca thi bạn được phân công chấm. Bài làm được mã hoá để chấm khách quan — bạn chỉ thấy mã thi, không thấy tên hay lớp HS."
      />

      {/* Blind-grading notice */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12.5px] text-violet-900">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <b>Chấm ẩn danh:</b> Hệ thống ẩn tên / lớp học sinh khi chấm để đảm
          bảo công bằng. Mỗi bài chỉ hiển thị bằng <b>mã thi (EX-xxxx)</b>.
          Tên HS sẽ được hiện lại sau khi điểm được chốt / công bố.
        </span>
      </div>

      {/* KPIs */}
      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="CA THI ĐƯỢC PHÂN"
          value={kpis.totalShifts}
          hint={`${kpis.pendingShifts} còn câu chờ chấm`}
          tone="amber"
        />
        <KpiTile
          icon={<ClipboardEdit className="h-4 w-4" />}
          label="BÀI CHỜ CHẤM"
          value={kpis.pendingAttempts}
          hint={`${kpis.totalAttempts} bài tổng`}
          tone="violet"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="CÂU ĐÃ CHẤM"
          value={kpis.gradedEssays}
          hint={`${kpis.totalEssays} câu tổng`}
          tone="emerald"
        />
        <KpiTile
          icon={<Sparkles className="h-4 w-4" />}
          label="TIẾN ĐỘ"
          value={`${
            kpis.totalEssays > 0
              ? Math.round((kpis.gradedEssays / kpis.totalEssays) * 100)
              : 0
          }%`}
          tone="blue"
        />
      </section>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { v: "pending", label: "Chờ chấm" },
            { v: "done", label: "Đã chấm xong" },
            { v: "all", label: "Tất cả" },
          ] as Array<{ v: QueueFilter; label: string }>
        ).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setFilter(opt.v)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition",
              filter === opt.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground/80 hover:bg-accent/30",
            )}
          >
            {opt.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã thi / ca thi / môn…"
            className="h-9 w-64 pl-8"
          />
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <ClipboardEdit className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {groups.length === 0
              ? "Bạn chưa được phân công chấm bài nào"
              : "Không có ca / bài thi khớp bộ lọc"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {groups.length === 0
              ? "Admin / TBM sẽ gán bạn vào ca thi có câu tự luận khi cần."
              : "Thử đổi bộ lọc hoặc từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredGroups.map((g) => {
            const isExpanded = expandedShifts.has(g.shiftId);
            const allDone = g.pendingAttempts === 0;
            return (
              <li
                key={g.shiftId}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggleShift(g.shiftId)}
                  className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition hover:bg-accent/10"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-bold leading-tight",
                      allDone
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {allDone ? (
                      "✓"
                    ) : (
                      <span>
                        {g.gradedTotal}
                        <span className="text-[9px] opacity-70">
                          /{g.essayTotal}
                        </span>
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-700">
                        {g.subjectName}
                      </span>
                      <p className="truncate text-[13.5px] font-semibold">
                        {g.shiftName}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      <span className="font-semibold">
                        {g.totalAttempts} bài thi
                      </span>{" "}
                      ·{" "}
                      <span
                        className={cn(
                          g.pendingAttempts > 0
                            ? "text-amber-700"
                            : "text-emerald-700",
                        )}
                      >
                        {g.pendingAttempts > 0
                          ? `${g.pendingAttempts} chờ chấm`
                          : "Đã chấm xong"}
                      </span>{" "}
                      · Nộp{" "}
                      {new Date(g.submittedRange.latest).toLocaleString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          allDone ? "bg-emerald-500" : "bg-amber-500",
                        )}
                        style={{
                          width: `${
                            g.essayTotal > 0
                              ? (g.gradedTotal / g.essayTotal) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <ArrowRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                </button>
                {isExpanded && (
                  <ul className="divide-y">
                    {g.items.map((row) => {
                      const isDone = row.gradedCount >= row.essayCount;
                      return (
                        <li key={row.attemptId}>
                          <Link
                            href={`/grading/${row.attemptId}`}
                            className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-accent/10"
                          >
                            <span
                              className={cn(
                                "rounded-md border bg-card px-2 py-1 font-mono text-[12px] font-bold tracking-wider",
                                isDone
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-violet-300 bg-violet-50 text-violet-800",
                              )}
                            >
                              {row.code}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-medium">
                                Bài thi mã {row.code}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {row.gradedCount}/{row.essayCount} câu tự luận
                                đã chấm ·{" "}
                                <Clock className="inline h-3 w-3" />{" "}
                                {new Date(row.submittedAt).toLocaleString(
                                  "vi-VN",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    day: "2-digit",
                                    month: "2-digit",
                                  },
                                )}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase",
                                isDone
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-amber-300 bg-amber-50 text-amber-800",
                              )}
                            >
                              {isDone ? "Đã chấm" : "Chờ chấm"}
                            </span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
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
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
  } as const;
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          tones[tone],
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[26px] font-bold leading-none", tones[tone])}>
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
