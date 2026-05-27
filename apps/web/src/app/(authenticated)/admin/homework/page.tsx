"use client";

import {
  BarChart3,
  ClipboardEdit,
  Eye,
  PencilLine,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  const [showArchived, setShowArchived] = useState(false);

  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const visible = useMemo(() => {
    let rows = allHomework.slice();
    if (!showArchived) rows = rows.filter((h) => !h.archivedAt);
    if (operatingCampusId) {
      rows = rows.filter((h) => h.campusId === operatingCampusId);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((h) => effectiveHomeworkState(h) === statusFilter);
    }
    if (subjectFilter !== "all") {
      rows = rows.filter((h) => h.subjectId === subjectFilter);
    }
    const sq = search.trim().toLowerCase();
    if (sq) {
      rows = rows.filter((h) =>
        `${h.title} ${h.description ?? ""} ${h.ownerName}`
          .toLowerCase()
          .includes(sq),
      );
    }
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [
    allHomework,
    showArchived,
    operatingCampusId,
    statusFilter,
    subjectFilter,
    search,
  ]);

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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Giao BTVN mới
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tiêu đề / mô tả / GV…"
          className="h-9 min-w-[220px] flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 min-w-[130px]"
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
          className="h-9 min-w-[130px]"
        >
          <option value="all">Môn: Tất cả</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hiển thị đã lưu trữ
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <ClipboardEdit className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-section-title">Chưa có BTVN nào</p>
          <p className="text-meta mt-1">
            Bấm <b>"Giao BTVN mới"</b> để bắt đầu.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((h) => {
            const subject = subjects.find((s) => s.id === h.subjectId);
            const grade = h.gradeId
              ? grades.find((g) => g.id === h.gradeId)
              : null;
            const eff = effectiveHomeworkState(h);
            const submitCount = attempts.filter(
              (a) => a.homeworkId === h.id && a.submittedAt != null,
            ).length;
            const totalAttempts = attempts.filter(
              (a) => a.homeworkId === h.id,
            ).length;
            return (
              <li key={h.id}>
                <article className="overflow-hidden rounded-xl border bg-card">
                  <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                    <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                      {h.id}
                    </span>
                    <StateBadge state={eff} />
                    {h.archivedAt ? (
                      <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        🗄 Đã lưu trữ
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {h.questionIds.length} câu · {h.classIds.length} lớp
                    </span>
                  </header>
                  <div className="space-y-2 px-4 py-3">
                    <p className="text-[15px] font-semibold">{h.title}</p>
                    {h.description ? (
                      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-foreground/80">
                        {h.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                      {subject && (
                        <span
                          className="rounded px-1.5 py-0.5 font-semibold"
                          style={{
                            backgroundColor: `${subject.color}1A`,
                            color: subject.color,
                          }}
                        >
                          {subject.name}
                        </span>
                      )}
                      {grade && (
                        <span className="rounded bg-foreground/8 px-1.5 py-0.5">
                          {grade.name}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        📅 {h.assignedAt} → {h.dueAt}
                      </span>
                      <span className="text-muted-foreground">
                        · {h.ownerName}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Đã nộp: <b className="text-foreground/80">{submitCount}</b>
                      {" / "}
                      Đã mở: <b className="text-foreground/80">{totalAttempts}</b>
                    </div>
                  </div>
                  <footer className="flex items-center justify-end gap-1 border-t bg-card/50 px-3 py-2">
                    <Link
                      href={`/admin/homework/${h.id}/stats`}
                      className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-medium hover:bg-accent/30"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Thống kê
                    </Link>
                    <Link
                      href={`/admin/homework/${h.id}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-medium hover:bg-accent/30"
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
                      </>
                    )}
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
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
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[state]}`}
    >
      {labels[state]}
    </span>
  );
}
