"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Library,
  Package2,
  Play,
  PlusCircle,
  Shield,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { ActivityChartCard } from "@/features/dashboard/components/activity-chart-card";
import { InProgressSection } from "@/features/dashboard/components/in-progress-section";
import { LiveExamsCard } from "@/features/dashboard/components/live-exams-card";
import { QuestionBankSummary } from "@/features/dashboard/components/question-bank-summary";
import { SystemStatusCard } from "@/features/dashboard/components/system-status-card";
import { useMyAttempts } from "@/features/dashboard/hooks/use-my-attempts";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { StudentDashboard } from "@/features/student/components/student-dashboard";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { PageHeader } from "@/features/shell/components/page-header";

export default function DashboardPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const { inProgress } = useMyAttempts();

  // Students get a totally different view — overview of their own learning
  // + assigned exam shifts. The admin/staff dashboard below is irrelevant
  // for them and exposes counts they shouldn't see.
  if (session?.role === "student") {
    return <StudentDashboard />;
  }
  // `inProgress` here is real — driven by auth-store.recentAttemptIds.

  // Resolve the campus that applies to this user — superadmin browses any
  // campus via activeCampusId, staff are pinned to their own.
  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  // Pull raw arrays so we can derive every KPI from real state instead of
  // hardcoded display numbers.
  const users = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allBlueprints = useBlueprintsStore((s) => s.blueprints);
  const allPackages = usePackagesStore((s) => s.packages);
  const allShifts = useShiftsStore((s) => s.shifts);
  const classes = useGradesStore((s) => s.classes);

  // Campus-scoped slices
  const scopedQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      if (q.kho !== "campus") return false;
      if (campusId) return q.campusId === campusId;
      return true;
    });
  }, [allQuestions, campusId]);

  const scopedPackages = useMemo(
    () =>
      allPackages.filter((p) =>
        campusId ? p.campusId === campusId : true,
      ),
    [allPackages, campusId],
  );

  const scopedShifts = useMemo(
    () => allShifts.filter((s) => (campusId ? s.campusId === campusId : true)),
    [allShifts, campusId],
  );

  const scopedUsers = useMemo(
    () =>
      users.filter((u) => {
        if (session?.role !== "superadmin" && campusId)
          return u.campusId === campusId;
        return true;
      }),
    [users, session, campusId],
  );

  const scopedClasses = useMemo(
    () => classes.filter((c) => (campusId ? c.campusId === campusId : true)),
    [classes, campusId],
  );

  // Compute every status-derived count in one pass over each list so the
  // dashboard doesn't traverse the same arrays 3-4 times per render.
  const aggregate = useMemo(() => {
    let pendingQuestions = 0;
    let approvedQuestions = 0;
    for (const q of scopedQuestions) {
      if (q.status === "pending") pendingQuestions++;
      else if (q.status === "approved") approvedQuestions++;
    }
    let pendingPackages = 0;
    for (const p of scopedPackages) {
      if (p.status === "pending") pendingPackages++;
    }
    let scheduledShifts = 0;
    let liveShifts = 0;
    for (const s of scopedShifts) {
      if (s.status === "scheduled") scheduledShifts++;
      else if (s.status === "in-progress") liveShifts++;
    }
    return {
      pendingApprovals: pendingQuestions + pendingPackages,
      approvedQuestions,
      scheduledShifts,
      liveShifts,
    };
  }, [scopedQuestions, scopedPackages, scopedShifts]);
  const { pendingApprovals, approvedQuestions, scheduledShifts, liveShifts } =
    aggregate;

  return (
    <>
      <PageHeader
        title={<>Xin chào, {session?.name ?? "bạn"} 👋</>}
        description="Tổng quan vận hành khảo thí · Cập nhật theo thời gian thực."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/shifts">
                <PlusCircle className="h-4 w-4" />
                Tạo ca thi mới
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/question-bank">
                <FileText className="h-4 w-4" />
                Ngân hàng câu hỏi
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/exam-blueprints">
                <Play className="h-4 w-4" />
                Khung đề & Gói đề
              </Link>
            </Button>
          </>
        }
      />

      <section
        aria-label="Chỉ số tổng quan"
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Người dùng"
          value={scopedUsers.length.toLocaleString("vi-VN")}
          icon={UsersIcon}
          tone="blue"
          hint={campusId ? "trong campus hiện tại" : "toàn hệ thống"}
        />
        <KpiCard
          label="Câu hỏi đã duyệt"
          value={approvedQuestions.toLocaleString("vi-VN")}
          icon={Library}
          tone="green"
          hint={`${scopedQuestions.length.toLocaleString("vi-VN")} tổng kho campus`}
        />
        <KpiCard
          label="Chờ duyệt"
          value={pendingApprovals.toLocaleString("vi-VN")}
          icon={ClipboardCheck}
          tone="orange"
          hint="câu hỏi + gói đề"
        />
        <KpiCard
          label="Ca thi đã lên lịch"
          value={(scheduledShifts + liveShifts).toLocaleString("vi-VN")}
          icon={CalendarClock}
          tone="violet"
          hint={
            liveShifts > 0
              ? `${liveShifts.toLocaleString("vi-VN")} đang diễn ra`
              : `${scopedShifts.length.toLocaleString("vi-VN")} tổng ca`
          }
        />
      </section>

      <section
        aria-label="Hoạt động và ca thi"
        className="mb-6 grid gap-3 lg:grid-cols-5"
      >
        <div className="lg:col-span-3">
          <ActivityChartCard />
        </div>
        <div className="lg:col-span-2">
          <LiveExamsCard />
        </div>
      </section>

      {inProgress.length > 0 ? (
        <section className="mb-6">
          <InProgressSection items={inProgress} />
        </section>
      ) : null}

      <section
        aria-label="Tổng hợp"
        className="mb-6 grid gap-3 lg:grid-cols-3"
      >
        <QuestionBankSummary />
        <SystemStatusCard />
        <SystemTotalsCard
          users={scopedUsers.length}
          classes={scopedClasses.length}
          blueprints={
            campusId
              ? allBlueprints.filter((b) => b.campusId === campusId).length
              : allBlueprints.length
          }
          packages={scopedPackages.length}
          shifts={scopedShifts.length}
        />
      </section>
    </>
  );
}

function SystemTotalsCard({
  users,
  classes,
  blueprints,
  packages,
  shifts,
}: {
  users: number;
  classes: number;
  blueprints: number;
  packages: number;
  shifts: number;
}) {
  const rows: Array<{
    label: string;
    value: number;
    icon: typeof UsersIcon;
    href: string;
    tone: string;
  }> = [
    {
      label: "Người dùng",
      value: users,
      icon: UsersIcon,
      href: "/admin/users",
      tone: "text-blue-600 bg-blue-50",
    },
    {
      label: "Lớp",
      value: classes,
      icon: CheckCircle2,
      href: "/admin/grades",
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Khung đề",
      value: blueprints,
      icon: FileText,
      href: "/admin/exam-blueprints",
      tone: "text-violet-600 bg-violet-50",
    },
    {
      label: "Gói đề",
      value: packages,
      icon: Package2,
      href: "/admin/exam-blueprints",
      tone: "text-amber-600 bg-amber-50",
    },
    {
      label: "Ca thi",
      value: shifts,
      icon: Shield,
      href: "/admin/shifts",
      tone: "text-rose-600 bg-rose-50",
    },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-5">
      <div>
        <h3 className="text-section-title inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-500" strokeWidth={2} />
          Tổng hợp hệ thống
        </h3>
        <p className="text-meta mt-0.5">Số lượng thực tế trong các store</p>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.label}>
              <Link
                href={row.href}
                className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/30"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${row.tone}`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-foreground/85">
                  {row.label}
                </span>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
                  {row.value.toLocaleString("vi-VN")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
