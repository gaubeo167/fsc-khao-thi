"use client";

import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardEdit,
  Download,
  Hourglass,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import {
  DEFAULT_SCORING,
  effectiveShiftStatus,
} from "@/features/exam-shifts/data/types";
import { formatScore } from "@/features/exam-shifts/lib/scoring";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { buildShiftReport } from "@/features/reports/lib/compute-stats";
import { generateInsights } from "@/features/reports/lib/ai-insights";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const session = useAuthStore((s) => s.session);
  const scope = useUserScope();
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const shifts = useShiftsStore((s) => s.shifts);
  const attempts = useAttemptsStore((s) => s.attempts);
  const questions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const packages = usePackagesStore((s) => s.packages);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const users = useUsersStore((s) => s.users);
  const essayGrades = useGradingStore((s) => s.grades);

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [reportTab, setReportTab] = useState<"shifts" | "homework">("shifts");

  const allHomework = useHomeworkStore((s) => s.homework);
  const homeworkAttempts = useHomeworkAttemptsStore((s) => s.attempts);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  // Only shifts that have actually ended (or were cancelled) generate a
  // meaningful report. Scheduled + in-progress shifts go to /admin/shifts
  // for live monitoring.
  const reportableShifts = useMemo(() => {
    return shifts
      .filter((s) => (campusId ? s.campusId === campusId : true))
      .filter((s) => {
        // Teachers only see reports for shifts in their môn/khối scope.
        if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
          if (!scope.allowedSubjectIds.has(s.subjectId)) return false;
          if (
            scope.allowedGradeIds != null &&
            !scope.allowedGradeIds.has(s.gradeId)
          ) {
            return false;
          }
        }
        const eff = effectiveShiftStatus(s);
        return eff === "completed" || eff === "cancelled";
      })
      .sort(
        (a, b) =>
          new Date(b.endAt).getTime() - new Date(a.endAt).getTime(),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, campusId, scope]);

  // Pre-compute per-shift summary so the list page can rank/badge.
  const summaries = useMemo(() => {
    return reportableShifts.map((shift) => {
      // Resolve eligible students for the shift (via room.studentIds or
      // shift.classIds fallback).
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
      // Resolve question pool for this shift.
      const pkg = packages.find((p) => p.id === shift.packageId);
      const bp = pkg
        ? blueprints.find((b) => b.id === pkg.blueprintId)
        : null;
      const poolIds = bp
        ? bp.topics.flatMap((t) => t.pickedQuestionIds)
        : [];
      const pool = poolIds
        .map((id) => questions.find((q) => q.id === id))
        .filter((q): q is NonNullable<typeof q> => !!q);
      const shiftAttempts = attempts.filter((a) => a.shiftId === shift.id);
      const report = buildShiftReport({
        shift,
        attempts: shiftAttempts,
        questions: pool,
        essayGrades: essayGrades.filter((g) => g.shiftId === shift.id),
        eligible,
      });
      const insights = generateInsights(report);
      const critical = insights.filter((i) => i.severity === "critical").length;
      const warns = insights.filter((i) => i.severity === "warn").length;
      return { shift, report, criticalCount: critical, warnCount: warns };
    });
  }, [
    reportableShifts,
    attempts,
    questions,
    packages,
    blueprints,
    allClasses,
    users,
    essayGrades,
  ]);

  const filtered = useMemo(() => {
    return summaries.filter(({ shift }) => {
      if (gradeFilter !== "all" && shift.gradeId !== gradeFilter) return false;
      if (subjectFilter !== "all" && shift.subjectId !== subjectFilter)
        return false;
      if (classFilter !== "all" && !shift.classIds.includes(classFilter))
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const subj =
          subjects.find((s) => s.id === shift.subjectId)?.name ?? "";
        if (
          !shift.name.toLowerCase().includes(q) &&
          !shift.id.toLowerCase().includes(q) &&
          !subj.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [summaries, search, subjects, gradeFilter, subjectFilter, classFilter]);

  // Aggregate KPIs across the FILTERED shifts (so changing grade/subject
  // filters updates the top KPIs and charts in lock-step).
  const kpis = useMemo(() => {
    let totalSubmitted = 0;
    let totalEligible = 0;
    let totalCritical = 0;
    let totalWarns = 0;
    const passRates: number[] = [];
    const avgPercents: number[] = [];
    for (const s of filtered) {
      totalSubmitted += s.report.totals.submitted;
      totalEligible += s.report.totals.eligible;
      totalCritical += s.criticalCount;
      totalWarns += s.warnCount;
      if (s.report.totals.submitted > 0) {
        passRates.push(s.report.totals.passRate);
        avgPercents.push(s.report.totals.avgPercent);
      }
    }
    const avgPassRate =
      passRates.length > 0
        ? Math.round(passRates.reduce((a, n) => a + n, 0) / passRates.length)
        : 0;
    const avgScorePercent =
      avgPercents.length > 0
        ? Math.round(
            avgPercents.reduce((a, n) => a + n, 0) / avgPercents.length,
          )
        : 0;
    return {
      shiftCount: filtered.length,
      totalSubmitted,
      totalEligible,
      avgPassRate,
      avgScorePercent,
      totalCritical,
      totalWarns,
    };
  }, [filtered]);

  // ───── Chart data — by subject, by grade, recent trend.
  // Each entry = aggregate of submitted attempts across shifts matching
  // that subject / grade in the FILTERED slice.
  const subjectChart = useMemo(() => {
    const map = new Map<
      string,
      {
        subjectName: string;
        attemptCount: number;
        passCount: number;
        avgPercentSum: number;
        shiftsWithData: number;
      }
    >();
    for (const s of filtered) {
      const subj =
        subjects.find((x) => x.id === s.shift.subjectId)?.name ?? "—";
      const cur = map.get(s.shift.subjectId) ?? {
        subjectName: subj,
        attemptCount: 0,
        passCount: 0,
        avgPercentSum: 0,
        shiftsWithData: 0,
      };
      cur.attemptCount += s.report.totals.submitted;
      cur.passCount += Math.round(
        (s.report.totals.passRate / 100) * s.report.totals.submitted,
      );
      if (s.report.totals.submitted > 0) {
        cur.avgPercentSum += s.report.totals.avgPercent;
        cur.shiftsWithData++;
      }
      map.set(s.shift.subjectId, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        subjectName: v.subjectName,
        attemptCount: v.attemptCount,
        passRate:
          v.attemptCount > 0
            ? Math.round((v.passCount / v.attemptCount) * 100)
            : 0,
        avgPercent:
          v.shiftsWithData > 0
            ? Math.round(v.avgPercentSum / v.shiftsWithData)
            : 0,
      }))
      .sort((a, b) => b.attemptCount - a.attemptCount);
  }, [filtered, subjects]);

  const gradeChart = useMemo(() => {
    const map = new Map<
      string,
      {
        gradeName: string;
        attemptCount: number;
        passCount: number;
        avgPercentSum: number;
        shiftsWithData: number;
      }
    >();
    for (const s of filtered) {
      const g = grades.find((x) => x.id === s.shift.gradeId);
      const name = g?.name ?? "—";
      const cur = map.get(s.shift.gradeId) ?? {
        gradeName: name,
        attemptCount: 0,
        passCount: 0,
        avgPercentSum: 0,
        shiftsWithData: 0,
      };
      cur.attemptCount += s.report.totals.submitted;
      cur.passCount += Math.round(
        (s.report.totals.passRate / 100) * s.report.totals.submitted,
      );
      if (s.report.totals.submitted > 0) {
        cur.avgPercentSum += s.report.totals.avgPercent;
        cur.shiftsWithData++;
      }
      map.set(s.shift.gradeId, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        gradeName: v.gradeName,
        attemptCount: v.attemptCount,
        passRate:
          v.attemptCount > 0
            ? Math.round((v.passCount / v.attemptCount) * 100)
            : 0,
        avgPercent:
          v.shiftsWithData > 0
            ? Math.round(v.avgPercentSum / v.shiftsWithData)
            : 0,
      }))
      .sort((a, b) => {
        // Natural ordering by grade number when possible.
        const na = Number(a.gradeName.match(/\d+/)?.[0] ?? 99);
        const nb = Number(b.gradeName.match(/\d+/)?.[0] ?? 99);
        return na - nb;
      });
  }, [filtered, grades]);

  // Recent trend (chronological last 10 shifts).
  const trendChart = useMemo(() => {
    return [...filtered]
      .slice(0, 12)
      .reverse()
      .map((s) => ({
        id: s.shift.id,
        label: new Date(s.shift.endAt).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
        avgPercent: s.report.totals.avgPercent,
        passRate: s.report.totals.passRate,
      }));
  }, [filtered]);

  // Danger zone callouts — surface things that need IMMEDIATE attention.
  const dangerZones = useMemo(() => {
    const out: Array<{
      severity: "critical" | "warn";
      title: string;
      detail: string;
    }> = [];
    // Subjects with avg < 50 across multiple shifts.
    for (const s of subjectChart) {
      if (s.attemptCount >= 3 && s.avgPercent < 50) {
        out.push({
          severity: "critical",
          title: `Môn ${s.subjectName}: TB ${s.avgPercent}/100`,
          detail: `${s.attemptCount} HS đã thi, điểm TB dưới 50. Đáng review chương trình hoặc độ khó đề.`,
        });
      } else if (s.attemptCount >= 3 && s.avgPercent < 65) {
        out.push({
          severity: "warn",
          title: `Môn ${s.subjectName}: TB ${s.avgPercent}/100`,
          detail: `${s.attemptCount} HS, kết quả thấp hơn ngưỡng Khá — cần theo dõi.`,
        });
      }
    }
    for (const g of gradeChart) {
      if (g.attemptCount >= 5 && g.passRate < 30) {
        out.push({
          severity: "critical",
          title: `${g.gradeName}: chỉ ${g.passRate}% đạt`,
          detail: `${g.attemptCount} HS đã thi qua các môn. Tỉ lệ đạt quá thấp — review trên toàn khối.`,
        });
      }
    }
    if (kpis.totalCritical > 0) {
      out.push({
        severity: "critical",
        title: `${kpis.totalCritical} ca thi có cảnh báo KHẨN từ AI`,
        detail: `Mở từng ca trong danh sách bên dưới để xem chi tiết AI insight.`,
      });
    }
    return out;
  }, [subjectChart, gradeChart, kpis.totalCritical]);

  if (!session) return null;
  if (!["teacher", "subject-lead", "campus-admin", "academic-director"].includes(
    session.role,
  )) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này dành cho giáo viên / TBM / Admin campus.
      </div>
    );
  }

  // BTVN aggregate stats — visible HW in the operating campus scope.
  const homeworkSummaries = useMemo(() => {
    const visible = allHomework
      .filter((h) => !h.archivedAt)
      .filter((h) => (campusId ? h.campusId === campusId : true))
      .filter((h) => {
        if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
          if (!scope.allowedSubjectIds.has(h.subjectId)) return false;
        }
        return true;
      });
    return visible.map((h) => {
      const myAttempts = homeworkAttempts.filter((a) => a.homeworkId === h.id);
      const submitted = myAttempts.filter((a) => a.submittedAt != null);
      const totalRoster =
        h.studentIds && h.studentIds.length > 0
          ? h.studentIds.length
          : 0; // Class-based roster harder to count cheaply
      const avgPct =
        submitted.length > 0
          ? Math.round(
              (submitted.reduce(
                (acc, a) =>
                  acc +
                  (a.totalQuestions
                    ? (a.correctCount ?? 0) / a.totalQuestions
                    : 0),
                0,
              ) /
                submitted.length) *
                100,
            )
          : 0;
      return {
        homework: h,
        submittedCount: submitted.length,
        rosterCount: totalRoster,
        avgPercent: avgPct,
      };
    });
  }, [
    allHomework,
    homeworkAttempts,
    campusId,
    scope.isUnscoped,
    scope.allowedSubjectIds,
  ]);

  const homeworkKpis = useMemo(() => {
    const total = homeworkSummaries.length;
    const submitted = homeworkSummaries.reduce(
      (n, h) => n + h.submittedCount,
      0,
    );
    const roster = homeworkSummaries.reduce((n, h) => n + h.rosterCount, 0);
    const avgPct =
      homeworkSummaries.filter((h) => h.submittedCount > 0).length === 0
        ? 0
        : Math.round(
            homeworkSummaries
              .filter((h) => h.submittedCount > 0)
              .reduce((acc, h) => acc + h.avgPercent, 0) /
              homeworkSummaries.filter((h) => h.submittedCount > 0).length,
          );
    return { total, submitted, roster, avgPercent: avgPct };
  }, [homeworkSummaries]);

  /** CSV download of the current report tab. */
  function exportCsv() {
    const lines: string[] = [];
    if (reportTab === "shifts") {
      lines.push(
        "Mã ca,Tên ca,Môn,Khối,Bắt đầu,Kết thúc,HS nộp,HS được gán,TB %,Tỉ lệ đạt %",
      );
      for (const { shift, report } of filtered) {
        const subject =
          subjects.find((s) => s.id === shift.subjectId)?.name ?? "";
        const grade = grades.find((g) => g.id === shift.gradeId)?.name ?? "";
        lines.push(
          [
            shift.id,
            csvEsc(shift.name),
            csvEsc(subject),
            csvEsc(grade),
            shift.startAt,
            shift.endAt,
            report.totals.submitted,
            report.totals.eligible,
            report.totals.avgPercent,
            report.totals.passRate,
          ].join(","),
        );
      }
    } else {
      lines.push(
        "Mã BTVN,Tiêu đề,Môn,Khối,Ngày giao,Hết hạn,HS nộp,HS được giao,TB %",
      );
      for (const h of homeworkSummaries) {
        const subject =
          subjects.find((s) => s.id === h.homework.subjectId)?.name ?? "";
        const grade = h.homework.gradeId
          ? grades.find((g) => g.id === h.homework.gradeId)?.name ?? ""
          : "";
        lines.push(
          [
            h.homework.id,
            csvEsc(h.homework.title),
            csvEsc(subject),
            csvEsc(grade),
            h.homework.assignedAt,
            h.homework.dueAt,
            h.submittedCount,
            h.rosterCount,
            h.avgPercent,
          ].join(","),
        );
      }
    }
    const csv = "﻿" + lines.join("\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${reportTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Kết quả & Báo cáo"
        description="Phân tích kết quả các ca thi và bài tập về nhà — phân bố điểm, độ khó, vi phạm và gợi ý AI."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[12.5px] font-medium hover:bg-accent/30"
            >
              <Download className="h-4 w-4" />
              Xuất báo cáo
            </button>
          </div>
        }
      />

      {/* Tab switcher — Ca thi vs Bài tập về nhà */}
      <div className="mb-4 inline-flex rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => setReportTab("shifts")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            reportTab === "shifts"
              ? "bg-foreground text-background"
              : "text-foreground/65 hover:bg-accent hover:text-foreground",
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Ca thi
        </button>
        <button
          type="button"
          onClick={() => setReportTab("homework")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            reportTab === "homework"
              ? "bg-foreground text-background"
              : "text-foreground/65 hover:bg-accent hover:text-foreground",
          )}
        >
          <ClipboardEdit className="h-3.5 w-3.5" />
          Bài tập về nhà
        </button>
      </div>

      {reportTab === "homework" ? (
        <HomeworkReports
          summaries={homeworkSummaries}
          kpis={homeworkKpis}
          subjects={subjects}
          grades={grades}
        />
      ) : (
      <>
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="CA THI ĐÃ DIỄN RA"
          value={kpis.shiftCount}
          tone="blue"
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="HS ĐÃ NỘP"
          value={kpis.totalSubmitted}
          hint={`${kpis.totalEligible} HS được gán`}
          tone="violet"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="TỈ LỆ ĐẠT TB"
          value={`${kpis.avgPassRate}%`}
          hint="qua các ca"
          tone="emerald"
          ring={kpis.avgPassRate}
        />
        <KpiTile
          icon={<Sparkles className="h-4 w-4" />}
          label="AI CẢNH BÁO"
          value={kpis.totalCritical}
          hint={`${kpis.totalWarns} cảnh báo thường`}
          tone={kpis.totalCritical > 0 ? "rose" : "muted"}
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="CA CÓ INSIGHT"
          value={summaries.filter((s) => s.criticalCount + s.warnCount > 0).length}
          tone="amber"
        />
      </section>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <select
          value={gradeFilter}
          onChange={(e) => {
            setGradeFilter(e.target.value);
            // Reset class filter when grade changes — otherwise a stale
            // class id from the previous grade silently zero-outs results.
            setClassFilter("all");
          }}
          className="h-9 rounded-md border bg-card px-2 text-[12.5px]"
        >
          <option value="all">Khối: Tất cả</option>
          {grades
            .filter((g) =>
              scope.isUnscoped ||
              scope.allowedGradeIds == null
                ? true
                : scope.allowedGradeIds.has(g.id),
            )
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          disabled={gradeFilter === "all"}
          title={
            gradeFilter === "all"
              ? "Chọn khối trước rồi mới lọc theo lớp"
              : undefined
          }
          className="h-9 rounded-md border bg-card px-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="all">
            {gradeFilter === "all" ? "Lớp: chọn khối trước" : "Lớp: Tất cả"}
          </option>
          {gradeFilter !== "all" &&
            allClasses
              .filter((c) => (campusId ? c.campusId === campusId : true))
              .filter((c) => c.gradeId === gradeFilter)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
        </select>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 rounded-md border bg-card px-2 text-[12.5px]"
        >
          <option value="all">Môn: Tất cả</option>
          {subjects
            .filter((s) => s.status === "active")
            .filter((s) =>
              scope.isUnscoped || scope.allowedSubjectIds == null
                ? true
                : scope.allowedSubjectIds.has(s.id),
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm ca thi / môn / ID…"
            className="h-9 w-64 pl-8"
          />
        </div>
        {(gradeFilter !== "all" ||
          classFilter !== "all" ||
          subjectFilter !== "all" ||
          search.trim()) && (
          <button
            type="button"
            onClick={() => {
              setGradeFilter("all");
              setClassFilter("all");
              setSubjectFilter("all");
              setSearch("");
            }}
            className="rounded-md border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent/30"
          >
            ✕ Xoá bộ lọc
          </button>
        )}
      </div>

      {/* Danger zone callouts — only render when there's something to flag */}
      {dangerZones.length > 0 && (
        <section className="mb-5 rounded-2xl border-2 border-rose-300 bg-rose-50/40 px-5 py-4">
          <h2 className="text-section-title inline-flex items-center gap-2 text-rose-900">
            <ShieldAlert className="h-4 w-4" />
            Vùng nguy hiểm ({dangerZones.length})
          </h2>
          <p className="mt-0.5 text-[12px] text-rose-800/80">
            Các chỉ số nằm trong ngưỡng cần can thiệp ngay.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {dangerZones.map((d, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-lg border-l-4 px-3 py-2",
                  d.severity === "critical"
                    ? "border-l-rose-500 bg-white"
                    : "border-l-amber-500 bg-white",
                )}
              >
                <p
                  className={cn(
                    "text-[12.5px] font-semibold",
                    d.severity === "critical"
                      ? "text-rose-900"
                      : "text-amber-900",
                  )}
                >
                  {d.severity === "critical" ? "🚨" : "⚠"} {d.title}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-foreground/75">
                  {d.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Charts — by subject & grade comparison + recent trend */}
      {filtered.length > 0 && (
        <section className="mb-5 grid gap-3 lg:grid-cols-3">
          <ComparisonChart
            title="Trung bình theo môn"
            icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
            rows={subjectChart.map((s) => ({
              label: s.subjectName,
              value: s.avgPercent,
              secondary: `${s.attemptCount} HS`,
              passRate: s.passRate,
            }))}
            dangerThreshold={50}
            warnThreshold={65}
          />
          <ComparisonChart
            title="Trung bình theo khối"
            icon={<TrendingDown className="h-4 w-4 text-violet-600" />}
            rows={gradeChart.map((g) => ({
              label: g.gradeName,
              value: g.avgPercent,
              secondary: `${g.attemptCount} HS`,
              passRate: g.passRate,
            }))}
            dangerThreshold={50}
            warnThreshold={65}
          />
          <TrendChart
            title="Xu hướng theo thời gian"
            icon={<BarChart3 className="h-4 w-4 text-emerald-600" />}
            rows={trendChart}
          />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-section-title inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          Danh sách ca thi ({filtered.length})
        </h2>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {summaries.length === 0
              ? "Chưa có ca thi nào kết thúc"
              : "Không có ca thi khớp tìm kiếm"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {summaries.length === 0
              ? "Khi 1 ca thi kết thúc, báo cáo + AI insight sẽ tự động sinh ra ở đây."
              : "Thử đổi từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map(({ shift, report, criticalCount, warnCount }) => {
            const subject = subjects.find((s) => s.id === shift.subjectId);
            const grade = grades.find((g) => g.id === shift.gradeId);
            const scoring = shift.scoring ?? DEFAULT_SCORING;
            const passColor =
              report.totals.passRate >= 70
                ? "text-emerald-700"
                : report.totals.passRate >= 50
                  ? "text-blue-700"
                  : report.totals.passRate >= 30
                    ? "text-amber-700"
                    : "text-rose-700";
            return (
              <li key={shift.id}>
                <Link
                  href={`/reports/${shift.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 transition hover:border-foreground/30 hover:bg-accent/10"
                >
                  <div
                    className={cn(
                      "flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-center",
                      report.totals.passRate >= 70
                        ? "bg-emerald-50 text-emerald-700"
                        : report.totals.passRate >= 50
                          ? "bg-blue-50 text-blue-700"
                          : report.totals.passRate >= 30
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700",
                    )}
                  >
                    <span className="text-[15px] font-bold leading-none">
                      {report.totals.passRate}%
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.06em]">
                      đạt
                    </span>
                  </div>
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
                      {criticalCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                          🚨 {criticalCount} khẩn
                        </span>
                      )}
                      {warnCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          ⚠ {warnCount} cảnh báo
                        </span>
                      )}
                      {report.totals.pendingEssayCount > 0 && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                          🕒 {report.totals.pendingEssayCount} chờ chấm
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-semibold">
                      {shift.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {report.totals.submitted}/{report.totals.eligible} nộp
                      </span>
                      <span className="inline-flex items-center gap-1">
                        TB:{" "}
                        <span className={cn("font-semibold", passColor)}>
                          {formatScore(report.totals.avgRaw)}/{formatScore(scoring.maxScore)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Hourglass className="h-3 w-3" />
                        {report.totals.avgDurationMin != null
                          ? `${report.totals.avgDurationMin}p TB`
                          : "—"}
                      </span>
                      <span>
                        Nộp{" "}
                        {new Date(shift.endAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </>
  );
}

/** CSV-escape a value: wrap in double quotes if it contains comma /
 *  quote / newline; escape inner quotes by doubling them. */
function csvEsc(s: string): string {
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

interface HomeworkSummaryRow {
  homework: import("@/features/homework/data/types").Homework;
  submittedCount: number;
  rosterCount: number;
  avgPercent: number;
}

function HomeworkReports({
  summaries,
  kpis,
  subjects,
  grades,
}: {
  summaries: HomeworkSummaryRow[];
  kpis: {
    total: number;
    submitted: number;
    roster: number;
    avgPercent: number;
  };
  subjects: Array<{ id: string; name: string; color: string }>;
  grades: Array<{ id: string; name: string; code: string }>;
}) {
  return (
    <>
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={<ClipboardEdit className="h-4 w-4" />}
          label="TỔNG BTVN"
          value={kpis.total}
          tone="blue"
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="HS ĐÃ NỘP"
          value={kpis.submitted}
          hint={`${kpis.roster} HS được giao`}
          tone="violet"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="TRUNG BÌNH ĐÚNG"
          value={`${kpis.avgPercent}%`}
          tone="emerald"
          ring={kpis.avgPercent}
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="ĐANG GIAO"
          value={summaries.filter((h) => h.submittedCount > 0).length}
          hint="BTVN đang có HS làm"
          tone="amber"
        />
      </section>

      {summaries.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <ClipboardEdit className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-section-title">Chưa có BTVN nào</p>
          <p className="text-meta mt-1">
            Tạo BTVN ở <b>Vận hành → Bài tập về nhà</b> rồi quay lại đây để
            xem báo cáo tổng hợp.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Mã</th>
                  <th className="px-4 py-2.5 text-left font-semibold">
                    Tiêu đề
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold">
                    Môn · Khối
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold">
                    Hạn nộp
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold">
                    Tiến độ
                  </th>
                  <th className="px-4 py-2.5 text-center font-semibold">
                    TB %
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaries
                  .slice()
                  .sort((a, b) =>
                    a.homework.dueAt < b.homework.dueAt ? 1 : -1,
                  )
                  .map((h) => {
                    const subject = subjects.find(
                      (s) => s.id === h.homework.subjectId,
                    );
                    const grade = h.homework.gradeId
                      ? grades.find((g) => g.id === h.homework.gradeId)
                      : null;
                    const pctTone =
                      h.avgPercent >= 75
                        ? "text-emerald-700"
                        : h.avgPercent >= 50
                          ? "text-blue-700"
                          : h.avgPercent >= 25
                            ? "text-amber-700"
                            : "text-rose-700";
                    const submitPct =
                      h.rosterCount > 0
                        ? Math.round(
                            (h.submittedCount / h.rosterCount) * 100,
                          )
                        : 0;
                    return (
                      <tr key={h.homework.id} className="hover:bg-accent/15">
                        <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {h.homework.id}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="line-clamp-1 font-semibold">
                            {h.homework.title}
                          </p>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">
                            GV {h.homework.ownerName}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {subject && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                                style={{
                                  backgroundColor: `${subject.color}1A`,
                                  color: subject.color,
                                }}
                              >
                                {subject.name}
                              </span>
                            )}
                            {grade && (
                              <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10.5px]">
                                {grade.code}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-foreground/80">
                          {h.homework.dueAt}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${submitPct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {h.submittedCount}/{h.rosterCount}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-2.5 text-center font-bold ${pctTone}`}
                        >
                          {h.submittedCount > 0 ? `${h.avgPercent}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/admin/homework/${h.homework.id}/stats`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] font-medium hover:bg-accent/30"
                            >
                              <BarChart3 className="h-3.5 w-3.5" />
                              Thống kê
                            </Link>
                            <Link
                              href={`/admin/homework/${h.homework.id}`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] font-medium hover:bg-accent/30"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Mở
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ComparisonChart({
  title,
  icon,
  rows,
  dangerThreshold,
  warnThreshold,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{
    label: string;
    value: number;
    secondary: string;
    passRate: number;
  }>;
  dangerThreshold: number;
  warnThreshold: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-section-title inline-flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <p className="text-meta mt-0.5">
        TB điểm % · Đỏ &lt; {dangerThreshold} · Vàng &lt; {warnThreshold}
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[11.5px] text-muted-foreground">
          Chưa có dữ liệu.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => {
            const tone =
              r.value < dangerThreshold
                ? "bg-rose-500"
                : r.value < warnThreshold
                  ? "bg-amber-500"
                  : "bg-emerald-500";
            const tagTone =
              r.value < dangerThreshold
                ? "text-rose-700"
                : r.value < warnThreshold
                  ? "text-amber-700"
                  : "text-emerald-700";
            return (
              <li key={r.label}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="truncate font-medium" title={r.label}>
                    {r.label}
                  </span>
                  <span
                    className={cn("font-bold tabular-nums", tagTone)}
                    title={`Đạt: ${r.passRate}%`}
                  >
                    {r.value}/100
                  </span>
                </div>
                <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn("h-full transition-all", tone)}
                    style={{ width: `${Math.max(2, r.value)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {r.secondary} · {r.passRate}% đạt
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TrendChart({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{
    id: string;
    label: string;
    avgPercent: number;
    passRate: number;
  }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-section-title inline-flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <p className="text-meta mt-0.5">
        Trung bình điểm % của {rows.length} ca gần nhất
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[11.5px] text-muted-foreground">
          Chưa có dữ liệu.
        </p>
      ) : (
        <div className="mt-3">
          {/* Bars vertical timeline. Each column = one shift. */}
          <div className="flex h-32 items-end gap-1">
            {rows.map((r) => {
              const tone =
                r.avgPercent < 50
                  ? "bg-rose-500"
                  : r.avgPercent < 65
                    ? "bg-amber-500"
                    : "bg-emerald-500";
              return (
                <div
                  key={r.id}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  title={`${r.label}: ${r.avgPercent}% (đạt ${r.passRate}%)`}
                >
                  <div className="relative h-full w-full">
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 right-0 rounded-t-sm transition-all",
                        tone,
                      )}
                      style={{ height: `${Math.max(4, r.avgPercent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1">
            {rows.map((r) => (
              <span
                key={r.id}
                className="flex-1 truncate text-center text-[9.5px] text-muted-foreground"
              >
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone,
  ring,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "violet" | "emerald" | "amber" | "rose" | "muted";
  /** When set, renders a mini circular progress chart instead of plain
   *  number — used for percentage metrics like "Tỉ lệ đạt TB". */
  ring?: number;
}) {
  const tones = {
    blue: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      stroke: "stroke-blue-500",
    },
    violet: {
      bg: "bg-violet-100",
      text: "text-violet-700",
      stroke: "stroke-violet-500",
    },
    emerald: {
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      stroke: "stroke-emerald-500",
    },
    amber: {
      bg: "bg-amber-100",
      text: "text-amber-700",
      stroke: "stroke-amber-500",
    },
    rose: {
      bg: "bg-rose-100",
      text: "text-rose-700",
      stroke: "stroke-rose-500",
    },
    muted: {
      bg: "bg-muted",
      text: "text-foreground",
      stroke: "stroke-foreground",
    },
  } as const;
  const t = tones[tone];
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            t.bg,
            t.text,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.06em]",
              t.text,
            )}
          >
            {label}
          </p>
          <p className={cn("mt-1 text-[24px] font-bold leading-none", t.text)}>
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
          )}
        </div>
        {ring != null ? (
          <MiniRing
            value={ring}
            strokeClass={t.stroke}
            className="shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Small circular progress chart drawn with raw SVG. Lightweight — no
 *  external chart lib needed for this scale. */
function MiniRing({
  value,
  strokeClass,
  className,
}: {
  value: number;
  strokeClass: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  return (
    <svg
      width={44}
      height={44}
      viewBox="0 0 44 44"
      className={className}
      aria-hidden
    >
      <circle
        cx={22}
        cy={22}
        r={r}
        className="stroke-muted/40 fill-none"
        strokeWidth={4}
      />
      <circle
        cx={22}
        cy={22}
        r={r}
        className={cn("fill-none", strokeClass)}
        strokeWidth={4}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}
