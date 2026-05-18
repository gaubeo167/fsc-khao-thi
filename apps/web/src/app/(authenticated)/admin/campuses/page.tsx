"use client";

import {
  Archive,
  Building2,
  Layers,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  School,
  Trash2,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CampusAdminsSection } from "@/features/campus/components/campus-admins-section";
import {
  CAMPUS_TIER_LABEL,
  CAMPUS_TIER_SHORT,
  type Campus,
} from "@/features/campus/data/seed-campuses";
import { CampusDialog } from "@/features/campus/dialogs/campus-dialog";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

export default function CampusesAdminPage() {
  const session = useAuthStore((s) => s.session);
  const campuses = useCampusesStore((s) => s.campuses);
  const removeCampus = useCampusesStore((s) => s.remove);
  const allClasses = useGradesStore((s) => s.classes);
  const users = useUsersStore((s) => s.users);
  const allQuestions = useQuestionsStore((s) => s.questions);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [deleting, setDeleting] = useState<Campus | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<Campus["tier"] | "all">("all");

  // Guard: only superadmin
  if (session?.role !== "superadmin") {
    return (
      <>
        <PageHeader
          title="Quản lý Campus"
          description="Chỉ Superadmin được truy cập trang này."
        />
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-10 text-center">
          <p className="text-section-title text-rose-800">
            Không có quyền truy cập
          </p>
          <p className="text-meta mt-1 text-rose-700">
            Trang quản lý Campus chỉ dành cho tài khoản Superadmin.
          </p>
        </div>
      </>
    );
  }

  const filtered = useMemo(() => {
    return campuses.filter((c) => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        if (
          !c.name.toLowerCase().includes(t) &&
          !c.code.toLowerCase().includes(t) &&
          !(c.address ?? "").toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [campuses, tierFilter, search]);

  const kpis = useMemo(() => {
    const activeCampuses = campuses.filter((c) => c.status === "active");
    const totalClasses = allClasses.length;
    const totalUsers = users.length;
    const totalQuestions = allQuestions.length;
    return {
      campuses: activeCampuses.length,
      classes: totalClasses,
      users: totalUsers,
      questions: totalQuestions,
    };
  }, [campuses, allClasses, users, allQuestions]);

  function statsFor(campus: Campus) {
    const classes = allClasses.filter((c) => c.campusId === campus.id);
    const campusUsers = users.filter((u) => u.campusId === campus.id);
    const teachers = campusUsers.filter(
      (u) =>
        u.role === "teacher" ||
        u.role === "subject-lead" ||
        u.role === "campus-admin",
    );
    const students = campusUsers.filter((u) => u.role === "student");
    const questions = allQuestions.filter(
      (q) => q.kho === "campus" && q.campusId === campus.id,
    );
    return {
      classes: classes.length,
      students: students.length,
      teachers: teachers.length,
      users: campusUsers.length,
      questions: questions.length,
    };
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: Campus) {
    setEditing(c);
    setDialogOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Quản lý Campus"
        description="Toàn quyền của Superadmin · Tạo/sửa/xoá campus và phân cấp học."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm campus
          </Button>
        }
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Campus đang hoạt động"
          value={kpis.campuses.toLocaleString("vi-VN")}
          icon={Building2}
          tone="blue"
        />
        <KpiCard
          label="Tổng lớp"
          value={kpis.classes.toLocaleString("vi-VN")}
          icon={School}
          tone="orange"
        />
        <KpiCard
          label="Tổng người dùng"
          value={kpis.users.toLocaleString("vi-VN")}
          icon={UsersIcon}
          tone="green"
        />
        <KpiCard
          label="Tổng câu hỏi kho campus"
          value={kpis.questions.toLocaleString("vi-VN")}
          icon={Layers}
          tone="violet"
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên / mã / địa chỉ…"
          className="h-9 min-w-[220px] flex-1"
        />
        <Select
          value={tierFilter}
          onChange={(e) =>
            setTierFilter(e.target.value as Campus["tier"] | "all")
          }
          className="h-9 min-w-[180px]"
        >
          <option value="all">Tất cả cấp học</option>
          {(Object.keys(CAMPUS_TIER_LABEL) as Campus["tier"][]).map((t) => (
            <option key={t} value={t}>
              {CAMPUS_TIER_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-section-title">Không có campus nào phù hợp.</p>
          <p className="text-small mt-1 text-muted-foreground">
            Thử thay đổi bộ lọc hoặc bấm "Thêm campus" để tạo mới.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const stats = statsFor(c);
            return (
              <li key={c.id}>
                <article
                  className={cn(
                    "overflow-hidden rounded-xl border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]",
                    c.status === "archived" && "opacity-70",
                  )}
                >
                  <header className="flex items-center gap-2 border-b bg-[var(--color-surface-2)] px-4 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-200">
                      <Building2 className="h-4 w-4" strokeWidth={1.85} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-card-title leading-tight">{c.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {c.code} · {c.region}
                      </p>
                    </div>
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {CAMPUS_TIER_SHORT[c.tier]}
                    </span>
                  </header>

                  <div className="space-y-2.5 px-4 py-3.5">
                    <p className="text-[12px] text-muted-foreground">
                      {CAMPUS_TIER_LABEL[c.tier]} ·{" "}
                      {c.gradeIds.length} khối ·{" "}
                      <span className="font-semibold text-foreground/85">
                        K{c.gradeIds[0]?.replace("grade-", "")}–K
                        {c.gradeIds[c.gradeIds.length - 1]?.replace(
                          "grade-",
                          "",
                        )}
                      </span>
                    </p>
                    {c.address && (
                      <p className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                        <MapPin
                          className="h-3 w-3"
                          strokeWidth={1.85}
                        />{" "}
                        {c.address}
                      </p>
                    )}
                    {c.phone && (
                      <p className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Phone
                          className="h-3 w-3"
                          strokeWidth={1.85}
                        />{" "}
                        {c.phone}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Stat
                        label="Lớp"
                        value={stats.classes}
                        icon={School}
                        tone="amber"
                      />
                      <Stat
                        label="Học sinh"
                        value={stats.students}
                        icon={UsersIcon}
                        tone="emerald"
                      />
                      <Stat
                        label="Giáo viên & TBM"
                        value={stats.teachers}
                        icon={UserCog}
                        tone="blue"
                      />
                      <Stat
                        label="Câu hỏi"
                        value={stats.questions}
                        icon={Layers}
                        tone="violet"
                      />
                    </div>

                    <CampusAdminsSection campus={c} />
                  </div>

                  <footer className="flex items-center gap-1 border-t bg-[var(--color-surface-2)] px-3 py-2">
                    {c.status === "archived" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <Archive className="h-3 w-3" strokeWidth={1.85} />
                        Đã lưu trữ
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <IconButton
                        size="sm"
                        variant="primary"
                        title="Sửa campus"
                        onClick={() => openEdit(c)}
                      >
                        <PencilLine
                          className="h-3.5 w-3.5"
                          strokeWidth={1.75}
                        />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="destructive"
                        title="Xoá campus"
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <CampusDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
      />

      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        variant="destructive"
        title="Xoá campus?"
        description={
          deleting ? (
            <>
              Campus <span className="font-semibold">{deleting.name}</span>.
              Hành động không thể hoàn tác. Người dùng / lớp / câu hỏi đang
              gắn campus này sẽ không bị xoá nhưng sẽ không còn campus chủ
              quản.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá campus"
        onConfirm={() => deleting && removeCampus(deleting.id)}
      />
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  tone: "amber" | "emerald" | "blue" | "violet";
}) {
  const palette = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5",
        palette,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
      <span className="text-[11px] font-semibold">{label}</span>
      <span className="ml-auto text-[13px] font-bold tabular-nums">
        {value.toLocaleString("vi-VN")}
      </span>
    </div>
  );
}
