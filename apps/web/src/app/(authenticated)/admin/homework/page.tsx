"use client";

import {
  AlertOctagon,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardEdit,
  Eye,
  GraduationCap,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";

import {
  effectiveHomeworkState,
  type Homework,
} from "@/features/homework/data/types";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";

const HomeworkFormDialog = dynamic(
  () =>
    import("@/features/homework/dialogs/homework-form-dialog").then(
      (m) => m.HomeworkFormDialog,
    ),
  { ssr: false, loading: () => null },
);

export default function HomeworkAdminPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const allHomework = useHomeworkStore((s) => s.homework);
  const archive = useHomeworkStore((s) => s.archive);
  const restore = useHomeworkStore((s) => s.restore);
  const attempts = useHomeworkAttemptsStore((s) => s.attempts);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const scope = useMemo(() => {
    let rows = allHomework.slice();
    if (!showArchived) rows = rows.filter((h) => !h.archivedAt);
    if (operatingCampusId) {
      rows = rows.filter((h) => h.campusId === operatingCampusId);
    }
    return rows;
  }, [allHomework, showArchived, operatingCampusId]);

  const kpis = useMemo(
    () => ({
      total: scope.length,
      open: scope.filter((h) => effectiveHomeworkState(h) === "open").length,
      scheduled: scope.filter(
        (h) => effectiveHomeworkState(h) === "scheduled",
      ).length,
      closed: scope.filter((h) => effectiveHomeworkState(h) === "closed").length,
    }),
    [scope],
  );

  const visible = useMemo(() => {
    let rows = scope;
    if (statusFilter !== "all") {
      rows = rows.filter((h) => effectiveHomeworkState(h) === statusFilter);
    }
    if (subjectFilter !== "all") {
      rows = rows.filter((h) => h.subjectId === subjectFilter);
    }
    if (gradeFilter !== "all") {
      rows = rows.filter((h) => h.gradeId === gradeFilter);
    }
    const sq = search.trim().toLowerCase();
    if (sq) {
      rows = rows.filter((h) =>
        `${h.title} ${h.description ?? ""} ${h.ownerName} ${h.id}`
          .toLowerCase()
          .includes(sq),
      );
    }
    // Newest first.
    return rows
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [scope, statusFilter, subjectFilter, gradeFilter, search]);

  const dirty =
    statusFilter !== "all" ||
    subjectFilter !== "all" ||
    gradeFilter !== "all" ||
    search.trim() !== "";

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(h: Homework) {
    setEditing(h);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Bài tập về nhà (BTVN)"
        description="Giáo viên giao bài tập theo lớp / khối · không giới hạn thời gian làm, có ngày hết hạn · tự chấm đúng/sai."
        actions={
          <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4" />
            Giao BTVN mới
          </Button>
        }
      />

      {/* Dashboard KPIs */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng BTVN"
          value={kpis.total.toLocaleString("vi-VN")}
          icon={ClipboardEdit}
          tone="blue"
        />
        <KpiCard
          label="Đang giao"
          value={kpis.open.toLocaleString("vi-VN")}
          icon={CalendarClock}
          tone="green"
        />
        <KpiCard
          label="Sắp mở"
          value={kpis.scheduled.toLocaleString("vi-VN")}
          icon={AlertOctagon}
          tone="orange"
        />
        <KpiCard
          label="Đã đóng"
          value={kpis.closed.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="violet"
        />
      </section>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề / mô tả / GV / mã…"
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Trạng thái: Tất cả</option>
          <option value="draft">Nháp</option>
          <option value="scheduled">Sắp mở</option>
          <option value="open">Đang giao</option>
          <option value="closed">Đã đóng</option>
        </Select>
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Môn: Tất cả</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="h-9 min-w-[110px]"
        >
          <option value="all">Khối: Tất cả</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hiển thị đã lưu trữ
        </label>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setSubjectFilter("all");
              setGradeFilter("all");
              setSearch("");
            }}
            className="rounded-md border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent/30"
          >
            <X className="mr-1 inline h-3 w-3" />
            Xoá bộ lọc
          </button>
        )}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <ClipboardEdit className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-section-title">
            {scope.length === 0
              ? "Chưa có BTVN nào"
              : "Không có BTVN phù hợp bộ lọc"}
          </p>
          {scope.length === 0 ? (
            <p className="text-meta mt-1">
              Bấm <b>"Giao BTVN mới"</b> để bắt đầu.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Mã</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Tiêu đề</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Môn · Khối</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Quy mô</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Hạn nộp</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Tiến độ</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Trạng thái</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((h) => {
                  const subject = subjects.find((s) => s.id === h.subjectId);
                  const grade = h.gradeId
                    ? grades.find((g) => g.id === h.gradeId)
                    : null;
                  const eff = effectiveHomeworkState(h);
                  const submitCount = attempts.filter(
                    (a) => a.homeworkId === h.id && a.submittedAt != null,
                  ).length;
                  const totalRoster = h.studentIds?.length ?? 0;
                  const pct =
                    totalRoster > 0
                      ? Math.round((submitCount / totalRoster) * 100)
                      : 0;
                  return (
                    <tr
                      key={h.id}
                      className={`hover:bg-accent/15 ${h.archivedAt ? "opacity-60" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {h.id}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="line-clamp-1 font-semibold text-foreground">
                          {h.title}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          GV {h.ownerName}
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
                              {grade.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/80">
                          <Tooltip
                            text={`Số lớp được giao: ${h.classIds.length}`}
                            className="gap-1 rounded-md px-1.5 py-0.5 hover:bg-blue-50"
                          >
                            <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                            <span className="ml-1 font-semibold">
                              {h.classIds.length}
                            </span>
                          </Tooltip>
                          <Tooltip
                            text={`Số học sinh được giao: ${totalRoster}`}
                            className="gap-1 rounded-md px-1.5 py-0.5 hover:bg-violet-50"
                          >
                            <Users className="h-3.5 w-3.5 text-violet-600" />
                            <span className="ml-1 font-semibold">
                              {totalRoster}
                            </span>
                          </Tooltip>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground/80">
                        {h.dueAt}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {submitCount}/{totalRoster}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StateBadge state={eff} />
                        {h.archivedAt ? (
                          <span className="ml-1 rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                            🗄
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/homework/${h.id}/stats`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] font-medium hover:bg-accent/30"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                            Thống kê
                          </Link>
                          <Link
                            href={`/admin/homework/${h.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] font-medium hover:bg-accent/30"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem
                          </Link>
                          {h.archivedAt ? (
                            <IconButton
                              size="sm"
                              variant="primary"
                              title="Khôi phục"
                              onClick={() => {
                                if (!session) return;
                                restore(h.id, session.userId);
                              }}
                            >
                              <RotateCcw
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                              />
                            </IconButton>
                          ) : (
                            <>
                              <IconButton
                                size="sm"
                                variant="primary"
                                title="Chỉnh sửa"
                                onClick={() => openEdit(h)}
                              >
                                <PencilLine
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.75}
                                />
                              </IconButton>
                              {(() => {
                                const hasData = attempts.some(
                                  (a) => a.homeworkId === h.id,
                                );
                                if (hasData) {
                                  // BTVN đã có HS làm — không cho lưu trữ.
                                  return (
                                    <IconButton
                                      size="sm"
                                      variant="destructive"
                                      title="🔒 BTVN đã có HS làm bài — không thể lưu trữ"
                                      onClick={() => {
                                        toast.error(
                                          "🔒 BTVN đã có HS làm bài — không thể lưu trữ. Có thể đổi sang trạng thái 'Đã đóng' để ngừng nhận bài mới.",
                                          { duration: 6000 },
                                        );
                                      }}
                                      className="opacity-50"
                                    >
                                      <Trash2
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.75}
                                      />
                                    </IconButton>
                                  );
                                }
                                return (
                                  <IconButton
                                    size="sm"
                                    variant="destructive"
                                    title="Lưu trữ"
                                    onClick={() => {
                                      if (!session) return;
                                      archive(
                                        h.id,
                                        session.userId,
                                        "GV lưu trữ BTVN",
                                      );
                                    }}
                                  >
                                    <Trash2
                                      className="h-3.5 w-3.5"
                                      strokeWidth={1.75}
                                    />
                                  </IconButton>
                                );
                              })()}
                            </>
                          )}
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

      <HomeworkFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
      />
    </>
  );
}

function StateBadge({
  state,
}: {
  state: "draft" | "scheduled" | "open" | "closed";
}) {
  const styles: Record<string, string> = {
    draft: "border-zinc-300 bg-zinc-100 text-zinc-600",
    scheduled: "border-amber-300 bg-amber-50 text-amber-700",
    open: "border-emerald-300 bg-emerald-50 text-emerald-700",
    closed: "border-blue-300 bg-blue-50 text-blue-700",
  };
  const labels: Record<string, string> = {
    draft: "Nháp",
    scheduled: "Sắp mở",
    open: "Đang giao",
    closed: "Đã đóng",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[state]}`}
    >
      {labels[state]}
    </span>
  );
}
