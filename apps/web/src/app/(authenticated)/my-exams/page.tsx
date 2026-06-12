"use client";

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ListChecks,
  Search,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { ShiftStatus } from "@/features/exam-shifts/data/types";
import { PageHeader } from "@/features/shell/components/page-header";
import { StudentShiftCard } from "@/features/student/components/student-shift-card";
import { useMyShifts } from "@/features/student/hooks/use-my-shifts";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

/** "active" is a virtual filter that bundles ca thi đang diễn ra +
 *  sắp diễn ra. It's the default landing view so HS không bị rối mắt
 *  bởi đống ca thi đã kết thúc/đã huỷ tích luỹ qua nhiều tháng — họ
 *  tự chọn "Tất cả" nếu muốn xem lịch sử. */
type FilterValue = ShiftStatus | "all" | "active";

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: "active", label: "Đang & sắp diễn ra" },
  { value: "all", label: "Tất cả (bao gồm đã kết thúc)" },
  { value: "in-progress", label: "Đang diễn ra" },
  { value: "scheduled", label: "Sắp diễn ra" },
  { value: "completed", label: "Đã kết thúc" },
  { value: "cancelled", label: "Đã huỷ" },
];

export default function MyExamsPage() {
  const session = useAuthStore((s) => s.session);
  const searchParams = useSearchParams();
  const initialFilter =
    (searchParams.get("filter") as FilterValue | null) ?? "active";

  const [filter, setFilter] = useState<FilterValue>(initialFilter);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const myShifts = useMyShifts();
  const subjects = useSubjectsStore((s) => s.subjects);

  // 30s tick so countdowns and status badges stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Subjects the student is actually scheduled for — keep the dropdown
  // tight rather than listing every subject in the campus.
  const mySubjects = useMemo(() => {
    const ids = new Set(myShifts.map((m) => m.shift.subjectId));
    return subjects.filter((s) => ids.has(s.id));
  }, [myShifts, subjects]);

  const filtered = useMemo(() => {
    return myShifts.filter((m) => {
      if (filter === "active") {
        if (
          m.effectiveStatus !== "in-progress" &&
          m.effectiveStatus !== "scheduled"
        ) {
          return false;
        }
      } else if (filter !== "all" && m.effectiveStatus !== filter) {
        return false;
      }
      if (subjectFilter !== "all" && m.shift.subjectId !== subjectFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${m.shift.name} ${m.shift.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [myShifts, filter, subjectFilter, search]);

  if (!session) return null;
  if (session.role !== "student") {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này chỉ dành cho tài khoản học sinh.
      </div>
    );
  }

  const counts = {
    all: myShifts.length,
    active: myShifts.filter(
      (m) =>
        m.effectiveStatus === "in-progress" ||
        m.effectiveStatus === "scheduled",
    ).length,
    "in-progress": myShifts.filter((m) => m.effectiveStatus === "in-progress").length,
    scheduled: myShifts.filter((m) => m.effectiveStatus === "scheduled").length,
    completed: myShifts.filter((m) => m.effectiveStatus === "completed").length,
    cancelled: myShifts.filter((m) => m.effectiveStatus === "cancelled").length,
    draft: 0,
  };

  const dirty =
    filter !== "active" || subjectFilter !== "all" || search.trim() !== "";

  return (
    <>
      <PageHeader
        title="Lịch thi của tôi"
        description={
          filter === "active"
            ? "Đang hiện các ca thi đang diễn ra + sắp diễn ra. Đổi bộ lọc sang \"Tất cả\" để xem cả ca đã kết thúc."
            : "Các ca thi bạn được gán — sắp tới, đang diễn ra và đã hoàn thành."
        }
      />

      {/* KPI strip — same shape as /admin/shifts */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng ca thi"
          value={counts.all.toLocaleString("vi-VN")}
          icon={ListChecks}
          tone="blue"
        />
        <KpiCard
          label="Đang diễn ra"
          value={counts["in-progress"].toLocaleString("vi-VN")}
          icon={Activity}
          tone="green"
        />
        <KpiCard
          label="Sắp diễn ra"
          value={counts.scheduled.toLocaleString("vi-VN")}
          icon={CalendarClock}
          tone="orange"
        />
        <KpiCard
          label="Đã kết thúc"
          value={counts.completed.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="violet"
        />
      </section>

      {/* Filter card — matches admin/shifts style */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên ca / mã ca thi…"
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterValue)}
          className="h-9 min-w-[160px]"
        >
          {FILTER_OPTIONS.map((opt) => {
            const c =
              opt.value === "all"
                ? counts.all
                : counts[opt.value as keyof typeof counts] ?? 0;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({c})
              </option>
            );
          })}
        </Select>
        {mySubjects.length > 1 && (
          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-9 min-w-[140px]"
          >
            <option value="all">Môn: Tất cả</option>
            {mySubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setFilter("active");
              setSubjectFilter("all");
              setSearch("");
            }}
            className="rounded-md border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent/30"
          >
            <X className="mr-1 inline h-3 w-3" />
            Xoá bộ lọc
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {myShifts.length === 0
              ? "Bạn chưa được gán ca thi nào"
              : filter === "active" && counts.completed + counts.cancelled > 0
                ? "Hiện không có ca thi nào đang diễn ra hoặc sắp tới"
                : "Không có ca thi phù hợp với bộ lọc"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {myShifts.length === 0 ? (
              "Khi giáo viên tạo ca thi và gán bạn vào, bạn sẽ thấy danh sách ở đây."
            ) : filter === "active" &&
              counts.completed + counts.cancelled > 0 ? (
              <>
                Bạn có {counts.completed + counts.cancelled} ca thi cũ đã ẩn —{" "}
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  hiện tất cả
                </button>{" "}
                để xem lại.
              </>
            ) : (
              "Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm."
            )}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((m) => (
            <li key={m.shift.id}>
              <StudentShiftCard item={m} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
