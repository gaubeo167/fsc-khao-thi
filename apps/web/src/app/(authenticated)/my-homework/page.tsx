"use client";

import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  ClipboardEdit,
  FileText,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";

import {
  effectiveHomeworkState,
  type Homework,
} from "@/features/homework/data/types";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";

export default function MyHomeworkPage() {
  const session = useAuthStore((s) => s.session);
  const allHomework = useHomeworkStore((s) => s.homework);
  const allClasses = useGradesStore((s) => s.classes);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const attempts = useHomeworkAttemptsStore((s) => s.attempts);

  // Student's class memberships — walk allClasses where studentIds
  // includes this student. classes don't always carry studentIds on
  // legacy shapes, so be defensive.
  const myClassIds = useMemo(() => {
    if (!session) return new Set<string>();
    const ids = new Set<string>();
    for (const c of allClasses) {
      const studentIds =
        (c as { studentIds?: string[] }).studentIds ?? [];
      if (studentIds.includes(session.userId)) ids.add(c.id);
    }
    return ids;
  }, [allClasses, session]);

  /** Visible-to-me — no UI filters applied yet. Used to compute KPIs
   *  before the user narrows down. */
  const scope = useMemo(() => {
    if (!session) return [];
    return allHomework
      .filter((h) => {
        if (h.archivedAt) return false;
        if (h.status === "draft") return false;
        if (session.campusId && h.campusId !== session.campusId) return false;
        if (h.studentIds && h.studentIds.length > 0) {
          return h.studentIds.includes(session.userId);
        }
        return h.classIds.some((cid) => myClassIds.has(cid));
      })
      .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
  }, [allHomework, session, myClassIds]);

  // UI filter state.
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  function rowStatus(h: Homework) {
    const eff = effectiveHomeworkState(h);
    const myAttempt = attempts.find(
      (a) => a.homeworkId === h.id && a.studentId === session?.userId,
    );
    if (myAttempt?.submittedAt) return "submitted" as const;
    if (eff === "scheduled") return "scheduled" as const;
    if (eff === "closed") return "missed" as const;
    return "open" as const;
  }

  // KPIs computed over `scope` (pre-filter) so the numbers don't
  // shrink when the user narrows the view.
  const kpis = useMemo(
    () => ({
      total: scope.length,
      open: scope.filter((h) => rowStatus(h) === "open").length,
      submitted: scope.filter((h) => rowStatus(h) === "submitted").length,
      missed: scope.filter((h) => rowStatus(h) === "missed").length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, attempts, session?.userId],
  );

  // Subjects the student actually has homework in — keeps the dropdown
  // tight.
  const mySubjects = useMemo(() => {
    const ids = new Set(scope.map((h) => h.subjectId));
    return subjects.filter((s) => ids.has(s.id));
  }, [scope, subjects]);

  const filtered = useMemo(() => {
    return scope.filter((h) => {
      if (statusFilter !== "all" && rowStatus(h) !== statusFilter) return false;
      if (subjectFilter !== "all" && h.subjectId !== subjectFilter) return false;
      const q = search.trim().toLowerCase();
      if (q && !`${h.title} ${h.description ?? ""} ${h.ownerName}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, statusFilter, subjectFilter, search, attempts, session?.userId]);

  const dirty =
    statusFilter !== "all" || subjectFilter !== "all" || search.trim() !== "";

  return (
    <>
      <PageHeader
        title="Bài tập về nhà"
        description="Bài tập giáo viên giao cho lớp / khối của bạn. Bấm vào để bắt đầu làm — có thể lưu giữa chừng và tiếp tục."
      />

      {/* KPI strip */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng BTVN"
          value={kpis.total.toLocaleString("vi-VN")}
          icon={ClipboardEdit}
          tone="blue"
        />
        <KpiCard
          label="Đang mở"
          value={kpis.open.toLocaleString("vi-VN")}
          icon={CalendarClock}
          tone="green"
        />
        <KpiCard
          label="Đã nộp"
          value={kpis.submitted.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="violet"
        />
        <KpiCard
          label="Quá hạn"
          value={kpis.missed.toLocaleString("vi-VN")}
          icon={AlertOctagon}
          tone="orange"
        />
      </section>

      {/* Filter card */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề / mô tả / GV…"
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 min-w-[150px]"
        >
          <option value="all">Trạng thái: Tất cả</option>
          <option value="open">Đang mở</option>
          <option value="scheduled">Chưa mở</option>
          <option value="submitted">Đã nộp</option>
          <option value="missed">Quá hạn</option>
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
              setStatusFilter("all");
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
        <div className="rounded-xl border bg-card p-10 text-center">
          <ClipboardEdit className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-section-title">
            {scope.length === 0 ? "Chưa có BTVN nào" : "Không có BTVN phù hợp"}
          </p>
          <p className="text-meta mt-1">
            {scope.length === 0
              ? "Giáo viên sẽ giao bài tập về nhà ở đây."
              : "Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((h) => {
            const subject = subjects.find((s) => s.id === h.subjectId);
            const grade = h.gradeId
              ? grades.find((g) => g.id === h.gradeId)
              : null;
            const st = rowStatus(h);
            return (
              <li key={h.id}>
                <Link
                  href={`/my-homework/${h.id}`}
                  className="block overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent/15"
                >
                  <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                    <RowStatusBadge status={st} />
                    {subject && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${subject.color}1A`,
                          color: subject.color,
                        }}
                      >
                        {subject.name}
                      </span>
                    )}
                    {grade && (
                      <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[11px]">
                        {grade.name}
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3 w-3" />
                      hết hạn {h.dueAt}
                    </span>
                  </header>
                  <div className="space-y-2 px-4 py-3">
                    <p className="text-[15px] font-semibold">{h.title}</p>
                    {h.description ? (
                      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-foreground/80">
                        {h.description}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {h.questionIds.length} câu
                      </span>
                      {h.materialIds.length > 0 && (
                        <span>📎 {h.materialIds.length} học liệu đính kèm</span>
                      )}
                      <span>· GV: {h.ownerName}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function RowStatusBadge({
  status,
}: {
  status: "scheduled" | "open" | "submitted" | "missed";
}) {
  const styles = {
    scheduled: "border-amber-300 bg-amber-50 text-amber-700",
    open: "border-emerald-300 bg-emerald-50 text-emerald-700",
    submitted: "border-blue-300 bg-blue-50 text-blue-700",
    missed: "border-rose-300 bg-rose-50 text-rose-700",
  } as const;
  const labels = {
    scheduled: "Chưa mở",
    open: "Đang mở",
    submitted: "Đã nộp",
    missed: "Quá hạn",
  } as const;
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
