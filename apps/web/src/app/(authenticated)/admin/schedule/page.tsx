"use client";

import {
  Activity,
  Bell,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import {
  effectiveShiftStatus,
  type ExamShift,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { SendReminderDialog } from "@/features/notifications/dialogs/send-reminder-dialog";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month";

export default function SchedulePage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const users = useUsersStore((s) => s.users);
  const scope = useUserScope();

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const [view, setView] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));
  const [reminderTarget, setReminderTarget] = useState<ExamShift | null>(null);

  // Scope filter — calendar entries must respect the teacher's subject /
  // grade assignment so a Văn teacher never sees Toán shift cells.
  const scoped = useMemo(
    () =>
      shifts.filter((s) => {
        if (campusId && s.campusId !== campusId) return false;
        if (!scope.isUnscoped && scope.allowedSubjectIds != null) {
          if (!scope.allowedSubjectIds.has(s.subjectId)) return false;
          if (
            scope.allowedGradeIds != null &&
            !scope.allowedGradeIds.has(s.gradeId)
          ) {
            return false;
          }
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts, campusId, scope],
  );

  // Window bounds based on view + anchor.
  const window = useMemo(() => {
    if (view === "day") {
      return { from: startOfDay(anchorDate), to: endOfDay(anchorDate) };
    }
    if (view === "week") {
      // Vietnamese convention: tuần bắt đầu từ Thứ 2.
      const monday = startOfWeek(anchorDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { from: monday, to: endOfDay(sunday) };
    }
    // month
    const first = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      1,
    );
    const last = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth() + 1,
      0,
    );
    return { from: startOfDay(first), to: endOfDay(last) };
  }, [view, anchorDate]);

  const visibleShifts = useMemo(() => {
    const fromMs = window.from.getTime();
    const toMs = window.to.getTime();
    return scoped.filter((s) => {
      const start = new Date(s.startAt).getTime();
      const end = new Date(s.endAt).getTime();
      // Shift visible if it overlaps the window.
      return end >= fromMs && start <= toMs;
    });
  }, [scoped, window]);

  function shift(amount: number) {
    const next = new Date(anchorDate);
    if (view === "day") next.setDate(next.getDate() + amount);
    else if (view === "week") next.setDate(next.getDate() + 7 * amount);
    else next.setMonth(next.getMonth() + amount);
    setAnchorDate(startOfDay(next));
  }

  // Quick KPI of upcoming shifts (next 7 days).
  const nextWeekShifts = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * 86_400_000;
    return scoped.filter((s) => {
      const startMs = new Date(s.startAt).getTime();
      return startMs >= now && startMs <= horizon;
    });
  }, [scoped]);

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

  return (
    <>
      <PageHeader
        title="Lịch thi"
        description="Xem tổng quan các ca thi sắp diễn ra theo ngày / tuần / tháng. Click 1 ca để xem chi tiết hoặc gửi nhắc nhở."
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAnchorDate(startOfDay(new Date()))}
          className="gap-1"
        >
          <CalendarSearch className="h-3.5 w-3.5" />
          Hôm nay
        </Button>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => shift(-1)}
            className="h-8 w-8 p-0"
            title={
              view === "day"
                ? "Hôm trước"
                : view === "week"
                  ? "Tuần trước"
                  : "Tháng trước"
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="rounded-md border bg-card px-3 py-1 text-[13px] font-semibold">
            {formatRangeLabel(view, anchorDate, window)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => shift(1)}
            className="h-8 w-8 p-0"
            title={
              view === "day"
                ? "Hôm sau"
                : view === "week"
                  ? "Tuần sau"
                  : "Tháng sau"
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(
            [
              { v: "day", label: "Ngày" },
              { v: "week", label: "Tuần" },
              { v: "month", label: "Tháng" },
            ] as Array<{ v: ViewMode; label: string }>
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setView(opt.v)}
              className={cn(
                "rounded-md border px-3 py-1 text-[12px] font-semibold transition",
                view === opt.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent/30",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Next 7 days summary banner */}
      {nextWeekShifts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-900">
          <CalendarRange className="h-4 w-4 shrink-0" />
          <span>
            <b>{nextWeekShifts.length} ca thi</b> trong 7 ngày tới.{" "}
            {nextWeekShifts.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setAnchorDate(startOfDay(new Date()));
                  setView("week");
                }}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Xem theo tuần →
              </button>
            )}
          </span>
        </div>
      )}

      {/* Body — switch by view */}
      {view === "day" && (
        <DayView
          date={anchorDate}
          shifts={visibleShifts}
          subjects={subjects}
          grades={grades}
          users={users}
          onSendReminder={(sh) => setReminderTarget(sh)}
        />
      )}
      {view === "week" && (
        <WeekView
          windowFrom={window.from}
          shifts={visibleShifts}
          subjects={subjects}
          grades={grades}
          users={users}
          onSendReminder={(sh) => setReminderTarget(sh)}
        />
      )}
      {view === "month" && (
        <MonthView
          anchor={anchorDate}
          shifts={visibleShifts}
          subjects={subjects}
          onPickDate={(d) => {
            setAnchorDate(startOfDay(d));
            setView("day");
          }}
        />
      )}

      {reminderTarget && (
        <SendReminderDialog
          open={Boolean(reminderTarget)}
          onOpenChange={(o) => !o && setReminderTarget(null)}
          shift={reminderTarget}
        />
      )}
    </>
  );
}

/* ───────────── Day view: hourly timeline ───────────── */

function DayView({
  date,
  shifts,
  subjects,
  grades,
  users,
  onSendReminder,
}: {
  date: Date;
  shifts: ExamShift[];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  users: ReturnType<typeof useUsersStore.getState>["users"];
  onSendReminder(shift: ExamShift): void;
}) {
  // Show 6:00 → 22:00 (16 hours). Each row = 1 hour.
  const hours = Array.from({ length: 16 }, (_, i) => 6 + i);
  const inDayShifts = shifts
    .filter((s) => sameDay(new Date(s.startAt), date))
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  if (inDayShifts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-[14px] font-semibold">
          Không có ca thi nào trong ngày này
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {date.toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <ul>
        {hours.map((h, idx) => {
          const hourShifts = inDayShifts.filter((s) => {
            const start = new Date(s.startAt);
            return start.getHours() === h;
          });
          return (
            <li
              key={h}
              className={cn(
                "grid grid-cols-[64px_minmax(0,1fr)] gap-2 px-4 py-2",
                idx < hours.length - 1 && "border-b",
              )}
            >
              <span className="text-[11.5px] font-semibold text-muted-foreground tabular-nums">
                {String(h).padStart(2, "0")}:00
              </span>
              <div className="space-y-1.5">
                {hourShifts.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground/40">·</span>
                ) : (
                  hourShifts.map((sh) => (
                    <ShiftRow
                      key={sh.id}
                      shift={sh}
                      subjects={subjects}
                      grades={grades}
                      users={users}
                      onSendReminder={() => onSendReminder(sh)}
                    />
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────── Week view: 7-day grid ───────────── */

function WeekView({
  windowFrom,
  shifts,
  subjects,
  grades,
  users,
  onSendReminder,
}: {
  windowFrom: Date;
  shifts: ExamShift[];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  users: ReturnType<typeof useUsersStore.getState>["users"];
  onSendReminder(shift: ExamShift): void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(windowFrom);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((d) => {
        const inDay = shifts
          .filter((s) => sameDay(new Date(s.startAt), d))
          .sort(
            (a, b) =>
              new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          );
        const isToday = sameDay(d, new Date());
        return (
          <div
            key={d.toISOString()}
            className={cn(
              "flex min-h-[160px] flex-col rounded-lg border bg-card",
              isToday && "border-primary ring-1 ring-primary/30",
            )}
          >
            <header
              className={cn(
                "border-b px-3 py-1.5",
                isToday ? "bg-primary/5" : "bg-muted/30",
              )}
            >
              <p
                className={cn(
                  "text-[10.5px] font-bold uppercase tracking-[0.06em]",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                {WEEKDAY_LABEL[d.getDay()]}
              </p>
              <p className="text-[15px] font-bold leading-tight">
                {d.getDate()}/{d.getMonth() + 1}
              </p>
            </header>
            <ul className="flex-1 space-y-1.5 p-2">
              {inDay.length === 0 ? (
                <li className="rounded-md border border-dashed bg-muted/10 px-2 py-3 text-center text-[10.5px] text-muted-foreground">
                  Không có ca
                </li>
              ) : (
                inDay.map((sh) => (
                  <li key={sh.id}>
                    <ShiftRow
                      shift={sh}
                      subjects={subjects}
                      grades={grades}
                      users={users}
                      onSendReminder={() => onSendReminder(sh)}
                      compact
                    />
                  </li>
                ))
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Month view: calendar grid ───────────── */

function MonthView({
  anchor,
  shifts,
  subjects,
  onPickDate,
}: {
  anchor: Date;
  shifts: ExamShift[];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  onPickDate(d: Date): void;
}) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(monthStart);
  const totalCells = Math.ceil(
    (monthEnd.getTime() - gridStart.getTime()) / 86_400_000 + 1,
  );
  // Round up to whole weeks.
  const cells = Array.from({ length: Math.ceil(totalCells / 7) * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/30 text-center">
        {WEEKDAY_LABEL.slice(1).concat(WEEKDAY_LABEL[0]!).map((w) => (
          <p
            key={w}
            className="py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
          >
            {w}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inDay = shifts.filter((s) =>
            sameDay(new Date(s.startAt), d),
          );
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = sameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDate(d)}
              className={cn(
                "min-h-[100px] border-b border-r p-1.5 text-left text-[11px] transition hover:bg-accent/20",
                !inMonth && "bg-muted/20 text-muted-foreground/50",
                isToday && "bg-primary/5",
              )}
            >
              <p
                className={cn(
                  "mb-1 text-[12px] font-bold",
                  isToday && "text-primary",
                )}
              >
                {d.getDate()}
              </p>
              {inDay.length > 0 && (
                <ul className="space-y-0.5">
                  {inDay.slice(0, 3).map((sh) => {
                    const subject = subjects.find((s) => s.id === sh.subjectId);
                    const eff = effectiveShiftStatus(sh);
                    return (
                      <li
                        key={sh.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] font-semibold",
                          eff === "in-progress"
                            ? "bg-emerald-100 text-emerald-800"
                            : eff === "completed"
                              ? "bg-violet-100 text-violet-800"
                              : eff === "cancelled"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-blue-100 text-blue-800",
                        )}
                      >
                        {String(new Date(sh.startAt).getHours()).padStart(
                          2,
                          "0",
                        )}
                        :
                        {String(new Date(sh.startAt).getMinutes()).padStart(
                          2,
                          "0",
                        )}{" "}
                        · {subject?.name ?? "—"}
                      </li>
                    );
                  })}
                  {inDay.length > 3 && (
                    <li className="text-[9.5px] text-muted-foreground">
                      + {inDay.length - 3} ca khác
                    </li>
                  )}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Shared shift row card ───────────── */

function ShiftRow({
  shift,
  subjects,
  grades,
  users,
  onSendReminder,
  compact,
}: {
  shift: ExamShift;
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  users: ReturnType<typeof useUsersStore.getState>["users"];
  onSendReminder(): void;
  compact?: boolean;
}) {
  const subject = subjects.find((s) => s.id === shift.subjectId);
  const grade = grades.find((g) => g.id === shift.gradeId);
  const eff = effectiveShiftStatus(shift);
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const studentCount =
    Array.from(new Set(shift.rooms.flatMap((r) => r.studentIds ?? []))).length ||
    users.filter((u) => u.role === "student" && u.campusId === shift.campusId)
      .length;
  void studentCount;
  const tone =
    eff === "in-progress"
      ? "border-emerald-300 bg-emerald-50"
      : eff === "completed"
        ? "border-violet-200 bg-violet-50/40"
        : eff === "cancelled"
          ? "border-rose-200 bg-rose-50/40"
          : "border-blue-200 bg-blue-50/40";
  return (
    <article
      className={cn(
        "rounded-md border bg-card transition hover:shadow-sm",
        tone,
        compact && "px-2 py-1.5",
        !compact && "px-3 py-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular-nums text-[11px] font-bold text-foreground/85">
          {hhmm(start)}–{hhmm(end)}
        </span>
        {subject && (
          <span className="rounded bg-blue-100 px-1.5 py-0 text-[10px] font-semibold text-blue-800">
            {subject.name}
          </span>
        )}
        {grade && (
          <span className="rounded bg-muted px-1 text-[9.5px] font-semibold text-foreground/70">
            {grade.code}
          </span>
        )}
        {/* Status badge — explicit text so teachers don't have to infer
            from the tone alone. The LIVE pulse stays for in-progress. */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[9.5px] font-bold uppercase tracking-[0.05em]",
            eff === "in-progress"
              ? "bg-emerald-100 text-emerald-800"
              : eff === "completed"
                ? "bg-violet-100 text-violet-800"
                : eff === "cancelled"
                  ? "bg-rose-100 text-rose-800"
                  : eff === "scheduled"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-slate-100 text-slate-700",
          )}
        >
          {eff === "in-progress" && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
          {eff === "in-progress"
            ? "Đang diễn ra"
            : eff === "completed"
              ? "Đã kết thúc"
              : eff === "cancelled"
                ? "Đã huỷ"
                : eff === "scheduled"
                  ? "Chưa bắt đầu"
                  : "Bản nháp"}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[12.5px] font-semibold leading-tight",
          compact && "text-[11.5px]",
        )}
      >
        {shift.name}
      </p>
      {!compact && (
        <p className="mt-0.5 text-[10.5px] text-muted-foreground">
          {shift.rooms.length} phòng ·{" "}
          {Array.from(new Set(shift.rooms.flatMap((r) => r.studentIds ?? []))).length}{" "}
          HS gán
        </p>
      )}
      <div
        className={cn(
          "mt-1 flex flex-wrap items-center gap-1",
          compact && "mt-0.5",
        )}
      >
        <Link
          href={`/admin/shifts/${shift.id}/monitor`}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
          title="Giám sát"
        >
          <Activity className="h-3 w-3" />
          {!compact && "Giám sát"}
        </Link>
        {(eff === "scheduled" || eff === "in-progress") && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onSendReminder();
            }}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-100"
            title="Gửi nhắc nhở"
          >
            <Bell className="h-3 w-3" />
            {!compact && "Nhắc HS"}
          </button>
        )}
        {eff === "completed" && (
          <Link
            href={`/reports/${shift.id}`}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 text-[10px] font-semibold text-violet-800 hover:bg-violet-100"
            title="Báo cáo"
          >
            <Eye className="h-3 w-3" />
            {!compact && "Báo cáo"}
          </Link>
        )}
      </div>
    </article>
  );
}

/* ───────────── Helpers ───────────── */

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date): Date {
  // Monday as the first day of the week (VN convention).
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + offset);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}
function formatRangeLabel(
  view: ViewMode,
  anchor: Date,
  window: { from: Date; to: Date },
): string {
  if (view === "day") {
    return anchor.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  if (view === "week") {
    return `${window.from.getDate()}/${window.from.getMonth() + 1} – ${window.to.getDate()}/${window.to.getMonth() + 1}/${window.to.getFullYear()}`;
  }
  return anchor.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
}
