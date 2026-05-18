"use client";

import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { StudentNotificationsPanel } from "@/features/notifications/components/student-notifications-panel";
import { useMyShifts } from "@/features/student/hooks/use-my-shifts";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

import { StudentShiftCard } from "./student-shift-card";

export function StudentDashboard() {
  const session = useAuthStore((s) => s.session);
  const myShifts = useMyShifts();
  const subjects = useSubjectsStore((s) => s.subjects);

  // 30s clock tick so the "đang diễn ra" badge / countdown stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Cross-tab sync for shifts is now automatic via the Firestore
  // onSnapshot listener (mounted once in AuthBootstrap) — no localStorage
  // event handler needed. Notifications still live locally; re-hydrate
  // those when another tab writes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key === "fsc-notifications") {
        import("@/features/notifications/state/notifications-store").then(
          (m) => m.useNotificationsStore.persist.rehydrate(),
        );
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const stats = useMemo(() => {
    const acc = {
      total: myShifts.length,
      scheduled: 0,
      live: 0,
      completed: 0,
    };
    for (const m of myShifts) {
      if (m.effectiveStatus === "in-progress") acc.live++;
      else if (m.effectiveStatus === "scheduled") acc.scheduled++;
      else if (m.effectiveStatus === "completed") acc.completed++;
    }
    return acc;
  }, [myShifts]);

  // Mock score baseline so the dashboard isn't empty on first login. Once
  // attempts have real scores, replace with a derived avg from those.
  const avgScore =
    stats.completed > 0
      ? Math.round(70 + Math.random() * 20) // 70–90 placeholder
      : null;

  const nextUp = myShifts
    .filter(
      (m) =>
        m.effectiveStatus === "in-progress" ||
        m.effectiveStatus === "scheduled",
    )
    .slice(0, 4);
  const recent = myShifts
    .filter((m) => m.effectiveStatus === "completed")
    .slice(0, 3);

  // Subject breakdown — # ca by subject so user sees what they're studying.
  const subjectBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of myShifts) {
      map.set(m.shift.subjectId, (map.get(m.shift.subjectId) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({
        id,
        name: subjects.find((s) => s.id === id)?.name ?? id,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [myShifts, subjects]);

  return (
    <>
      <PageHeader
        title={<>Xin chào, {session?.name ?? "bạn"} 👋</>}
        description="Tổng quan tình hình học tập và các ca thi sắp tới."
        actions={
          <Button asChild size="sm">
            <Link href="/my-exams">
              <ListChecks className="h-4 w-4" />
              Xem lịch thi
            </Link>
          </Button>
        }
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="TỔNG CA"
          value={stats.total}
          hint="ca thi đã được gán"
          tone="blue"
        />
        <StatTile
          icon={<Clock className="h-4 w-4" />}
          label="ĐANG DIỄN RA"
          value={stats.live}
          hint={stats.live > 0 ? "Vào thi ngay bên dưới" : "Hiện không có ca nào"}
          tone="green"
          highlight={stats.live > 0}
        />
        <StatTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="SẮP TỚI"
          value={stats.scheduled}
          hint="ca thi sắp diễn ra"
          tone="amber"
        />
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ĐÃ HOÀN THÀNH"
          value={stats.completed}
          hint={
            avgScore != null ? `Điểm TB ~${avgScore}/100 (mock)` : "Chưa có dữ liệu"
          }
          tone="violet"
        />
      </section>

      {stats.live > 0 && (
        <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-semibold text-emerald-900">
              Bạn có {stats.live} ca thi đang diễn ra
            </span>
            <Button asChild size="sm" className="ml-auto">
              <Link href="/my-exams?filter=in-progress">Vào thi ngay</Link>
            </Button>
          </div>
        </section>
      )}

      <section
        aria-label="Ca thi sắp tới"
        className="mb-6 grid gap-3 lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-section-title inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              Ca thi sắp tới ({nextUp.length})
            </h2>
            {myShifts.length > nextUp.length && (
              <Link
                href="/my-exams"
                className="text-[12px] font-semibold text-blue-700 hover:underline"
              >
                Xem tất cả →
              </Link>
            )}
          </div>
          {nextUp.length === 0 ? (
            <EmptyState
              icon={<AlertCircle className="h-5 w-5 text-muted-foreground" />}
              title="Chưa có ca thi nào sắp diễn ra"
              hint="Bạn sẽ thấy danh sách ca thi khi được giáo viên gán."
            />
          ) : (
            <ul className="space-y-3">
              {nextUp.map((m) => (
                <li key={m.shift.id}>
                  <StudentShiftCard item={m} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {/* Notifications first — sits at the top of the sidebar so HS
              never miss an exam reminder from GV/admin. */}
          <StudentNotificationsPanel />

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-section-title inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Môn bạn đang học
            </h3>
            <p className="text-meta mt-0.5">
              Số ca thi theo môn — toàn thời gian
            </p>
            {subjectBreakdown.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                Chưa có dữ liệu.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {subjectBreakdown.map((row) => {
                  const max = subjectBreakdown[0]?.count ?? 1;
                  const pct = (row.count / max) * 100;
                  return (
                    <li key={row.id}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-muted-foreground">
                          {row.count} ca
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {recent.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-section-title inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-violet-600" />
                Ca thi gần đây
              </h3>
              <ul className="mt-3 space-y-2">
                {recent.map((m) => {
                  const subject =
                    subjects.find((s) => s.id === m.shift.subjectId)?.name ??
                    "—";
                  return (
                    <li key={m.shift.id}>
                      <Link
                        href={`/exam/${m.shift.id}/result`}
                        className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/30"
                      >
                        <p className="truncate text-[13px] font-medium">
                          {m.shift.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {subject} ·{" "}
                          {new Date(m.shift.endAt).toLocaleDateString("vi-VN")}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone: "blue" | "green" | "amber" | "violet";
  highlight?: boolean;
}) {
  const tones: Record<typeof tone, { text: string; ring?: string; bg?: string }> =
    {
      blue: { text: "text-blue-700" },
      green: {
        text: "text-emerald-700",
        ring: "ring-2 ring-emerald-300",
        bg: "bg-emerald-50/40",
      },
      amber: { text: "text-amber-700" },
      violet: { text: "text-violet-700" },
    };
  const t = tones[tone];
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        highlight && [t.ring, t.bg],
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          t.text,
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[26px] font-bold leading-none", t.text)}>
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-6 text-center">
      <div className="mx-auto mb-2 inline-flex items-center justify-center rounded-full bg-muted/40 p-2">
        {icon}
      </div>
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}
