"use client";

import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

/**
 * Upcoming / live exam shifts, derived from `useShiftsStore`. Shows the next
 * 3 shifts that are either in-progress or scheduled to start soon, scoped
 * to the user's campus.
 */
export function LiveExamsCard() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const shifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);
  const classes = useGradesStore((s) => s.classes);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const upcoming = useMemo(() => {
    const now = Date.now();
    return shifts
      .filter((s) => (campusId ? s.campusId === campusId : true))
      .filter(
        (s) =>
          (s.status === "scheduled" && new Date(s.endAt).getTime() > now) ||
          s.status === "in-progress",
      )
      .sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      )
      .slice(0, 3);
  }, [shifts, campusId]);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-section-title">Ca thi sắp / đang diễn ra</h3>
            <p className="text-meta mt-0.5">
              {upcoming.length === 0
                ? "Chưa có ca thi nào sắp tới"
                : `${upcoming.length} ca trong campus${
                    campusId ? " hiện tại" : ""
                  }`}
            </p>
          </div>
          <Link
            href="/admin/shifts"
            className="text-meta font-medium text-foreground/70 hover:text-foreground"
          >
            Xem tất cả →
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="flex-1 rounded-lg border border-dashed bg-muted/20 p-6 text-center">
            <p className="text-meta">
              Tạo ca thi mới ở trang{" "}
              <Link
                href="/admin/shifts"
                className="font-semibold text-primary hover:underline"
              >
                Ca kíp thi
              </Link>{" "}
              để các ca sắp tới xuất hiện ở đây.
            </p>
          </div>
        ) : (
          <ul className="flex-1 space-y-0">
            {upcoming.map((sh, i) => {
              const subject = subjects.find((s) => s.id === sh.subjectId);
              const totalStudents = classes
                .filter((c) => sh.classIds.includes(c.id))
                .reduce((s, c) => s + c.studentCount, 0);
              return (
                <li key={sh.id}>
                  {i > 0 ? <Separator /> : null}
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-card-title truncate">
                        {sh.name}
                        {subject && (
                          <span
                            className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold align-middle"
                            style={{
                              backgroundColor: `${subject.color}1A`,
                              color: subject.color,
                            }}
                          >
                            {subject.code}
                          </span>
                        )}
                      </p>
                      <p className="text-meta mt-0.5 flex items-center gap-2">
                        <span>{formatStartTime(sh.startAt)}</span>
                        <span className="text-foreground/25">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users
                            className="h-3 w-3"
                            strokeWidth={1.75}
                          />{" "}
                          {totalStudents.toLocaleString("vi-VN")}
                        </span>
                        <span className="text-foreground/25">·</span>
                        <span
                          className={
                            sh.status === "in-progress"
                              ? "rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                              : "rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
                          }
                        >
                          {sh.status === "in-progress"
                            ? "Đang thi"
                            : "Đã lên lịch"}
                        </span>
                      </p>
                    </div>
                    <Link
                      href="/admin/shifts"
                      aria-label={`Chi tiết ${sh.name}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatStartTime(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === today.toDateString()) return `Hôm nay · ${time}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString())
      return `Ngày mai · ${time}`;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${time}`;
  } catch {
    return iso;
  }
}
