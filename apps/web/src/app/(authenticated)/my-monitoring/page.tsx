"use client";

import {
  Activity,
  ArrowRight,
  CalendarClock,
  Eye,
  Hourglass,
  Search,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  effectiveShiftStatus,
  type ShiftStatus,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

export default function MyMonitoringPage() {
  const session = useAuthStore((s) => s.session);
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const users = useUsersStore((s) => s.users);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ShiftStatus | "all">("all");

  // Resolve shifts where THIS teacher is an assigned proctor (any room).
  const myShifts = useMemo(() => {
    if (!session) return [];
    return shifts
      .filter((s) =>
        s.rooms.some((r) => r.proctorIds.includes(session.userId)),
      )
      .filter((s) =>
        session.role === "superadmin"
          ? true
          : s.campusId === session.campusId,
      );
  }, [session, shifts]);

  const filtered = useMemo(() => {
    return myShifts.filter((s) => {
      const eff = effectiveShiftStatus(s);
      if (filter !== "all" && eff !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const subjName =
          subjects.find((su) => su.id === s.subjectId)?.name ?? "";
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.id.toLowerCase().includes(q) &&
          !subjName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [myShifts, filter, search, subjects]);

  // Sort: in-progress first → scheduled by startAt asc → completed by endAt desc.
  const sorted = useMemo(() => {
    const order: Record<ShiftStatus, number> = {
      "in-progress": 0,
      scheduled: 1,
      draft: 2,
      completed: 3,
      cancelled: 4,
    };
    return [...filtered].sort((a, b) => {
      const oa = order[effectiveShiftStatus(a)];
      const ob = order[effectiveShiftStatus(b)];
      if (oa !== ob) return oa - ob;
      const ea = effectiveShiftStatus(a);
      if (ea === "completed") {
        return new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
      }
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
  }, [filtered]);

  const kpis = useMemo(() => {
    const acc = {
      total: myShifts.length,
      live: 0,
      upcoming: 0,
      done: 0,
    };
    for (const s of myShifts) {
      const eff = effectiveShiftStatus(s);
      if (eff === "in-progress") acc.live++;
      else if (eff === "scheduled") acc.upcoming++;
      else if (eff === "completed") acc.done++;
    }
    return acc;
  }, [myShifts]);

  if (!session) return null;
  if (!["teacher", "subject-lead"].includes(session.role)) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này dành cho giáo viên / TBM được phân công làm giám thị. Admin
        dùng "Ca kíp thi" để xem giám sát toàn campus.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Giám sát thi"
        description="Các ca thi bạn được phân công làm giám thị. Click 1 ca để vào phòng giám sát real-time."
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <KpiTile
          icon={<Shield className="h-4 w-4" />}
          label="CA ĐƯỢC GIÁM SÁT"
          value={kpis.total}
          tone="violet"
        />
        <KpiTile
          icon={<Activity className="h-4 w-4" />}
          label="ĐANG DIỄN RA"
          value={kpis.live}
          tone="emerald"
          highlight={kpis.live > 0}
        />
        <KpiTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="SẮP TỚI"
          value={kpis.upcoming}
          tone="blue"
        />
        <KpiTile
          icon={<Hourglass className="h-4 w-4" />}
          label="ĐÃ KẾT THÚC"
          value={kpis.done}
          tone="muted"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        {(
          [
            { v: "all", label: "Tất cả" },
            { v: "in-progress", label: "Đang diễn ra" },
            { v: "scheduled", label: "Sắp tới" },
            { v: "completed", label: "Đã kết thúc" },
          ] as Array<{ v: ShiftStatus | "all"; label: string }>
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
            placeholder="Tìm ca / môn / ID…"
            className="h-9 w-64 pl-8"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {myShifts.length === 0
              ? "Bạn chưa được phân công giám thị ca thi nào"
              : "Không có ca thi khớp bộ lọc"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {myShifts.length === 0
              ? "Admin / TBM phân công giám thị trong Bước 4 — Phòng & Giám thị của Wizard tạo ca thi. Khi được gán, ca thi sẽ xuất hiện ở đây."
              : "Thử đổi bộ lọc hoặc từ khoá tìm kiếm."}
          </p>
          {myShifts.length === 0 && (
            <Link
              href="/admin/schedule"
              className="mt-4 inline-block text-[12px] font-semibold text-blue-700 hover:underline"
            >
              Xem lịch thi tổng quan →
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((sh) => {
            const subject = subjects.find((s) => s.id === sh.subjectId);
            const grade = grades.find((g) => g.id === sh.gradeId);
            const eff = effectiveShiftStatus(sh);
            const myRooms = sh.rooms.filter((r) =>
              r.proctorIds.includes(session.userId),
            );
            const otherProctors = sh.rooms
              .flatMap((r) => r.proctorIds.filter((id) => id !== session.userId))
              .map((id) => users.find((u) => u.id === id)?.name)
              .filter((n): n is string => !!n);
            const studentCount = myRooms.reduce(
              (a, r) => a + (r.studentIds ?? []).length,
              0,
            );
            return (
              <li key={sh.id}>
                <Link
                  href={`/admin/shifts/${sh.id}/monitor`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition",
                    eff === "in-progress"
                      ? "border-emerald-300 ring-2 ring-emerald-200/60 hover:border-emerald-400"
                      : "hover:border-foreground/30 hover:bg-accent/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                      eff === "in-progress"
                        ? "bg-emerald-100 text-emerald-700"
                        : eff === "scheduled"
                          ? "bg-blue-100 text-blue-700"
                          : eff === "completed"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {eff === "in-progress" ? (
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                      </span>
                    ) : (
                      <Activity className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                        {sh.id}
                      </span>
                      {subject && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                          {subject.name}
                        </span>
                      )}
                      {grade && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                          {grade.code}
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0 text-[10px] font-bold uppercase",
                          eff === "in-progress"
                            ? "bg-emerald-100 text-emerald-800"
                            : eff === "scheduled"
                              ? "bg-blue-100 text-blue-800"
                              : eff === "completed"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {eff === "in-progress"
                          ? "Đang diễn ra"
                          : eff === "scheduled"
                            ? "Chưa bắt đầu"
                            : eff === "completed"
                              ? "Đã kết thúc"
                              : eff === "cancelled"
                                ? "Đã huỷ"
                                : "Bản nháp"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-semibold">
                      {sh.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(sh.startAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}{" "}
                        →{" "}
                        {new Date(sh.endAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Phòng:{" "}
                        <b>{myRooms.map((r) => r.name).join(", ")}</b>
                        {" · "}
                        {studentCount} HS
                      </span>
                      {otherProctors.length > 0 && (
                        <span>
                          GT khác: {otherProctors.slice(0, 2).join(", ")}
                          {otherProctors.length > 2 &&
                            ` +${otherProctors.length - 2}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold",
                      eff === "in-progress"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-border bg-card text-foreground/80",
                    )}
                  >
                    <Eye className="h-3 w-3" />
                    {eff === "in-progress" ? "Vào ngay" : "Xem"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
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
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "violet" | "emerald" | "blue" | "muted";
  highlight?: boolean;
}) {
  const tones = {
    violet: "text-violet-700",
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    muted: "text-foreground/70",
  } as const;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        highlight && "ring-2 ring-emerald-300 ring-offset-1",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          tones[tone],
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[24px] font-bold leading-none", tones[tone])}>
        {value}
      </div>
    </div>
  );
}
