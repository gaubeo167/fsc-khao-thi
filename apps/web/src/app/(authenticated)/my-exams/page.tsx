"use client";

import { ListChecks, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { ShiftStatus } from "@/features/exam-shifts/data/types";
import { PageHeader } from "@/features/shell/components/page-header";
import { StudentShiftCard } from "@/features/student/components/student-shift-card";
import { useMyShifts } from "@/features/student/hooks/use-my-shifts";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

type FilterValue = ShiftStatus | "all";

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "in-progress", label: "Đang diễn ra" },
  { value: "scheduled", label: "Sắp diễn ra" },
  { value: "completed", label: "Đã kết thúc" },
  { value: "cancelled", label: "Đã huỷ" },
];

export default function MyExamsPage() {
  const session = useAuthStore((s) => s.session);
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterValue | null) ?? "all";

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
      if (filter !== "all" && m.effectiveStatus !== filter) return false;
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
    "in-progress": myShifts.filter((m) => m.effectiveStatus === "in-progress").length,
    scheduled: myShifts.filter((m) => m.effectiveStatus === "scheduled").length,
    completed: myShifts.filter((m) => m.effectiveStatus === "completed").length,
    cancelled: myShifts.filter((m) => m.effectiveStatus === "cancelled").length,
    draft: 0,
  };

  return (
    <>
      <PageHeader
        title="Lịch thi của tôi"
        description="Các ca thi bạn được gán — sắp tới, đang diễn ra và đã hoàn thành."
      />

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const c =
            opt.value === "all"
              ? counts.all
              : counts[opt.value as keyof typeof counts] ?? 0;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-medium transition",
                filter === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground/80 hover:bg-accent/30",
              )}
            >
              {opt.label}{" "}
              <span
                className={cn(
                  "ml-1 rounded px-1 text-[10px] font-semibold",
                  filter === opt.value
                    ? "bg-primary-foreground/20"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {c}
              </span>
            </button>
          );
        })}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên ca / ID…"
            className="h-9 w-64 pl-8"
          />
        </div>

        {mySubjects.length > 1 && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-9 rounded-md border bg-card px-2 text-[12px]"
          >
            <option value="all">Tất cả môn ({mySubjects.length})</option>
            {mySubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {myShifts.length === 0
              ? "Bạn chưa được gán ca thi nào"
              : "Không có ca thi phù hợp với bộ lọc"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {myShifts.length === 0
              ? "Khi giáo viên tạo ca thi và gán bạn vào, bạn sẽ thấy danh sách ở đây."
              : "Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm."}
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
