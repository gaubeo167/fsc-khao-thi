"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGeneratedStore } from "@/features/exams/state/generated-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";

/**
 * Recent system activity, derived from real store contents (no placeholder
 * numbers). Buckets entries created in the last 30 days by day for a tiny
 * sparkline; the metric tiles show absolute totals for that window.
 */
export function ActivityChartCard() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const users = useUsersStore((s) => s.users);
  const questions = useQuestionsStore((s) => s.questions);
  const packages = usePackagesStore((s) => s.packages);
  const generated = useGeneratedStore((s) => s.generated);
  const shifts = useShiftsStore((s) => s.shifts);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const { metrics, sparklineDays } = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const since = now - thirtyDays;

    const inWindow = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t >= since && t <= now;
    };

    const scopedUsers = users.filter((u) =>
      campusId ? u.campusId === campusId : true,
    );
    const scopedQuestions = questions.filter((q) =>
      q.kho === "campus" && (campusId ? q.campusId === campusId : true),
    );
    const scopedPackages = packages.filter((p) =>
      campusId ? p.campusId === campusId : true,
    );
    const scopedShifts = shifts.filter((s) =>
      campusId ? s.campusId === campusId : true,
    );

    const newUsers = scopedUsers.filter((u) => inWindow(u.createdAt)).length;
    const newQuestions = scopedQuestions.filter((q) => inWindow(q.createdAt))
      .length;
    const newPackages = scopedPackages.filter((p) => inWindow(p.createdAt))
      .length;
    const newGenerated = generated.filter(
      (g) =>
        inWindow(g.createdAt) &&
        scopedPackages.some((p) => p.id === g.packageId),
    ).length;
    const newShifts = scopedShifts.filter((s) => inWindow(s.createdAt)).length;

    // Bucket all activity by day (last 30 days) for the sparkline.
    const dayBucketsQ = new Array(30).fill(0) as number[];
    const dayBucketsS = new Array(30).fill(0) as number[];
    const bucketIndex = (iso: string) => {
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t) || t < since || t > now) return -1;
      return Math.floor((t - since) / (24 * 60 * 60 * 1000));
    };
    for (const q of scopedQuestions) {
      const i = bucketIndex(q.createdAt);
      if (i >= 0) dayBucketsQ[i] = (dayBucketsQ[i] ?? 0) + 1;
    }
    for (const s of scopedShifts) {
      const i = bucketIndex(s.createdAt);
      if (i >= 0) dayBucketsS[i] = (dayBucketsS[i] ?? 0) + 1;
    }

    return {
      metrics: {
        users: newUsers,
        questions: newQuestions,
        packages: newPackages,
        generated: newGenerated,
        shifts: newShifts,
      },
      sparklineDays: { q: dayBucketsQ, s: dayBucketsS },
    };
  }, [users, questions, packages, generated, shifts, campusId]);

  const hasAny =
    metrics.questions + metrics.packages + metrics.generated + metrics.shifts >
    0;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-section-title">Hoạt động hệ thống</h3>
            <p className="text-meta mt-0.5">
              Số bản ghi mới tạo trong 30 ngày qua
            </p>
          </div>
          <span className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-foreground/70">
            30 ngày qua
          </span>
        </div>

        <ul className="grid grid-cols-3 gap-3">
          <Metric
            label="Câu hỏi mới"
            value={metrics.questions}
            tone="green"
          />
          <Metric label="Gói đề mới" value={metrics.packages} tone="orange" />
          <Metric
            label="Ca thi mới"
            value={metrics.shifts}
            tone="blue"
          />
        </ul>

        <div className="relative min-h-[160px] flex-1 rounded-lg border bg-muted/30">
          {hasAny ? (
            <Sparkline data={sparklineDays} />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center">
              <p className="text-meta">
                Chưa có hoạt động nào trong 30 ngày qua. Tạo câu hỏi / gói đề /
                ca thi để biểu đồ xuất hiện.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "orange" | "blue" | "green";
}) {
  const dot =
    tone === "orange"
      ? "bg-[var(--color-tone-orange)]"
      : tone === "blue"
        ? "bg-[var(--color-tone-blue)]"
        : "bg-[var(--color-tone-green)]";
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-meta">{label}</span>
      </div>
      <p className="text-[18px] font-semibold tabular-nums text-foreground">
        {value.toLocaleString("vi-VN")}
      </p>
    </li>
  );
}

/** Real (non-placeholder) sparkline derived from the day-bucketed activity. */
function Sparkline({ data }: { data: { q: number[]; s: number[] } }) {
  const w = 600;
  const h = 160;
  const path = (vals: number[]) => {
    const max = Math.max(1, ...vals);
    const step = w / Math.max(1, vals.length - 1);
    return vals
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(
            h -
            (v / max) * (h - 20) -
            10
          ).toFixed(1)}`,
      )
      .join(" ");
  };
  return (
    <svg
      role="img"
      aria-label="Biểu đồ hoạt động 30 ngày qua"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-full w-full"
    >
      {[0.25, 0.5, 0.75].map((y) => (
        <line
          key={y}
          x1="0"
          x2={w}
          y1={h * y}
          y2={h * y}
          stroke="var(--color-border)"
          strokeDasharray="2 4"
        />
      ))}
      <path
        d={path(data.q)}
        fill="none"
        stroke="var(--color-tone-green)"
        strokeWidth="1.75"
      />
      <path
        d={path(data.s)}
        fill="none"
        stroke="var(--color-tone-blue)"
        strokeWidth="1.75"
      />
    </svg>
  );
}
