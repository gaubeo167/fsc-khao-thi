"use client";

import {
  GraduationCap,
  Plus,
  ShieldOff,
  Upload,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import type { SeedUser } from "@/features/auth/data/seed-users";
import type { Role } from "@/features/auth/state/auth-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { findCampus } from "@/features/campus/data/seed-campuses";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { ASSIGNABLE_ROLES } from "@/features/admin/users/role-labels";
import { useUsersStore } from "@/features/admin/users/users-store";
import {
  EMPTY_USER_FILTERS,
  UsersFilterBar,
  type UserFilters,
} from "@/features/admin/users/users-filter-bar";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { UsersTable } from "@/features/admin/users/users-table";
import { UsersPagination } from "@/features/admin/users/users-pagination";
// Heavy dialogs (subject / grade pickers, password reset) — split out so
// they only load when actually opened. Saves a lot of dev compile time
// for the /admin/users route.
const CreateUserDialog = dynamic(
  () =>
    import("@/features/admin/users/dialogs/create-user-dialog").then(
      (m) => m.CreateUserDialog,
    ),
  { ssr: false, loading: () => null },
);
const BulkCreateStudentsDialog = dynamic(
  () =>
    import(
      "@/features/admin/users/dialogs/bulk-create-students-dialog"
    ).then((m) => m.BulkCreateStudentsDialog),
  { ssr: false, loading: () => null },
);
const StudentProgressDialog = dynamic(
  () =>
    import(
      "@/features/student-progress/dialogs/student-progress-dialog"
    ).then((m) => m.StudentProgressDialog),
  { ssr: false, loading: () => null },
);
const EditUserDialog = dynamic(
  () =>
    import("@/features/admin/users/dialogs/edit-user-dialog").then(
      (m) => m.EditUserDialog,
    ),
  { ssr: false, loading: () => null },
);
const UserDetailsDialog = dynamic(
  () =>
    import("@/features/admin/users/dialogs/user-details-dialog").then(
      (m) => m.UserDetailsDialog,
    ),
  { ssr: false, loading: () => null },
);
const ResetPasswordDialog = dynamic(
  () =>
    import("@/features/admin/users/dialogs/reset-password-dialog").then(
      (m) => m.ResetPasswordDialog,
    ),
  { ssr: false, loading: () => null },
);
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { PageHeader } from "@/features/shell/components/page-header";

export default function UsersAdminPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  const users = useUsersStore((s) => s.users);
  const setStatus = useUsersStore((s) => s.setStatus);
  const remove = useUsersStore((s) => s.remove);
  const { canMutate } = useCampusGate();

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [progressStudentId, setProgressStudentId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SeedUser | null>(null);
  const [editing, setEditing] = useState<SeedUser | null>(null);
  const [resetting, setResetting] = useState<SeedUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SeedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SeedUser | null>(null);

  // Filters + pagination
  const [filters, setFilters] = useState<UserFilters>(EMPTY_USER_FILTERS);
  // Class → grade lookup used to filter students by grade (student
  // membership is stored at class granularity, not grade).
  const allClasses = useGradesStore((s) => s.classes);
  const classGradeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allClasses) m.set(c.id, c.gradeId);
    return m;
  }, [allClasses]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const allowedRoles = useMemo<Role[]>(() => {
    if (session?.role === "superadmin") return ASSIGNABLE_ROLES;
    return ASSIGNABLE_ROLES.filter((r) => r !== "campus-admin");
  }, [session?.role]);

  const scoped = useMemo(() => {
    if (!session) return [];
    let base = users.filter(
      (u) => u.role !== "superadmin" && u.id !== session.userId,
    );
    if (session.role === "superadmin") {
      if (activeCampusId) base = base.filter((u) => u.campusId === activeCampusId);
    } else if (session.role === "campus-admin") {
      base = base.filter((u) => u.campusId === session.campusId);
    } else {
      return [];
    }
    return base;
  }, [users, session, activeCampusId]);

  const filtered = useMemo(() => {
    return scoped.filter((u) => {
      if (filters.role !== "all" && u.role !== filters.role) return false;
      if (filters.status !== "all" && u.status !== filters.status) return false;
      if (
        session?.role === "superadmin" &&
        filters.campusId !== "all" &&
        u.campusId !== filters.campusId
      ) {
        return false;
      }
      if (filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        const hay = `${u.name} ${u.email} ${u.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Subject filter — relevant for teachers / subject-leads. Students
      // don't have subjectIds, so any subject filter excludes them by
      // design.
      if (filters.subjectId !== "all") {
        const subjectIds = u.subjectIds ?? [];
        if (!subjectIds.includes(filters.subjectId)) return false;
      }
      // Grade filter:
      //   - teachers / subject-leads: check gradeIds (which khối họ phụ trách)
      //   - students: walk their classIds, map each to its grade, check membership
      if (filters.gradeId !== "all") {
        if (u.role === "student") {
          const myClassIds = u.classIds ?? [];
          const myGradeIds = new Set(
            myClassIds
              .map((cid) => classGradeMap.get(cid))
              .filter((g): g is string => !!g),
          );
          if (!myGradeIds.has(filters.gradeId)) return false;
        } else {
          const gradeIds = u.gradeIds ?? [];
          if (!gradeIds.includes(filters.gradeId)) return false;
        }
      }
      // Class filter — primarily for students (who have classIds).
      // Teachers also store classIds for "Lớp quản lý"; honor either.
      if (filters.classId !== "all") {
        const classIds = u.classIds ?? [];
        if (!classIds.includes(filters.classId)) return false;
      }
      return true;
    });
  }, [scoped, filters, session?.role, classGradeMap]);

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [
    filters.query,
    filters.role,
    filters.status,
    filters.campusId,
    filters.subjectId,
    filters.gradeId,
    filters.classId,
    activeCampusId,
  ]);

  const paged = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return filtered.slice(startIdx, startIdx + pageSize);
  }, [filtered, page, pageSize]);

  // KPI counts (scoped, not filtered)
  const kpis = useMemo(() => {
    const total = scoped.length;
    const teachers = scoped.filter((u) => u.role === "teacher" || u.role === "subject-lead").length;
    const students = scoped.filter((u) => u.role === "student").length;
    const suspended = scoped.filter((u) => u.status === "suspended").length;
    return { total, teachers, students, suspended };
  }, [scoped]);

  const scopeLabel = (() => {
    if (!session) return "";
    if (session.role === "campus-admin") {
      const c = findCampus(session.campusId);
      return `Phạm vi quản lý: ${c?.name ?? session.campusId}`;
    }
    if (activeCampusId) {
      const c = findCampus(activeCampusId);
      return `Phạm vi quản lý: ${c?.name ?? activeCampusId}`;
    }
    return "Phạm vi quản lý: toàn bộ FSchools";
  })();

  // Permissions
  const canDelete = session?.role === "superadmin";

  return (
    <>
      <PageHeader
        title="Quản lý người dùng"
        description={scopeLabel}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={!canMutate}
              title={
                !canMutate
                  ? "Chọn 1 campus để nhập HS hàng loạt"
                  : "Tạo HS hàng loạt từ file Excel"
              }
            >
              <Upload className="h-4 w-4" />
              Nhập HS từ Excel
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để thêm người dùng" : undefined}
            >
              <Plus className="h-4 w-4" />
              Thêm người dùng
            </Button>
          </>
        }
      />

      <CampusGateBanner />

      <section aria-label="Chỉ số tài khoản" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tổng số người dùng" value={kpis.total.toLocaleString("vi-VN")} icon={UsersIcon} tone="blue" />
        <KpiCard
          label="Giáo viên + TBM"
          value={kpis.teachers.toLocaleString("vi-VN")}
          icon={GraduationCap}
          tone="orange"
          hint={kpis.total > 0 ? `${Math.round((kpis.teachers / kpis.total) * 100)}% toàn hệ` : undefined}
        />
        <KpiCard
          label="Học sinh"
          value={kpis.students.toLocaleString("vi-VN")}
          icon={UserCheck}
          tone="green"
          hint={kpis.total > 0 ? `${Math.round((kpis.students / kpis.total) * 100)}% toàn hệ` : undefined}
        />
        <KpiCard
          label="Tạm khoá / Vô hiệu hoá"
          value={kpis.suspended.toLocaleString("vi-VN")}
          icon={ShieldOff}
          tone="violet"
        />
      </section>

      <div className="mb-3">
        <UsersFilterBar
          filters={filters}
          onChange={setFilters}
          hideCampusFilter={session?.role !== "superadmin"}
          allowedRoles={allowedRoles}
          campusScopeId={
            session?.role === "superadmin"
              ? activeCampusId ?? null
              : session?.campusId ?? null
          }
        />
      </div>

      <div className="space-y-3">
        <UsersTable
          users={paged}
          canDelete={canDelete}
          onView={setViewing}
          onEdit={setEditing}
          onResetPassword={setResetting}
          onToggleSuspend={setSuspendTarget}
          onDelete={setDeleteTarget}
          onViewProgress={(u) => setProgressStudentId(u.id)}
        />

        <UsersPagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {/* Dialogs */}
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BulkCreateStudentsDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <StudentProgressDialog
        studentId={progressStudentId}
        onClose={() => setProgressStudentId(null)}
      />
      <UserDetailsDialog user={viewing} onClose={() => setViewing(null)} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />

      <ConfirmActionDialog
        open={Boolean(suspendTarget)}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        variant={suspendTarget?.status === "suspended" ? "default" : "destructive"}
        title={
          suspendTarget?.status === "suspended"
            ? "Mở khoá tài khoản?"
            : "Tạm khoá tài khoản?"
        }
        description={
          suspendTarget?.status === "suspended" ? (
            <>
              Người dùng <span className="font-medium text-foreground/85">{suspendTarget.name}</span>{" "}
              sẽ có thể đăng nhập trở lại.
            </>
          ) : suspendTarget ? (
            <>
              Người dùng <span className="font-medium text-foreground/85">{suspendTarget.name}</span>{" "}
              sẽ không thể đăng nhập cho tới khi bạn mở khoá.
            </>
          ) : (
            ""
          )
        }
        confirmLabel={suspendTarget?.status === "suspended" ? "Mở khoá" : "Tạm khoá"}
        onConfirm={() => {
          if (!suspendTarget) return;
          setStatus(
            suspendTarget.id,
            suspendTarget.status === "suspended" ? "active" : "suspended",
          );
        }}
      />

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        variant="destructive"
        title="Xoá vĩnh viễn tài khoản?"
        description={
          deleteTarget ? (
            <>
              Mọi dữ liệu của <span className="font-medium text-foreground/85">{deleteTarget.name}</span>{" "}
              (<span className="font-mono">{deleteTarget.id}</span>) sẽ bị xoá. Hành động này không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá vĩnh viễn"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
        }}
      />
    </>
  );
}
