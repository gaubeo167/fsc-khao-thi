"use client";

import {
  GraduationCap,
  LayoutGrid,
  PencilLine,
  Plus,
  School,
  Trash2,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useUsersStore } from "@/features/admin/users/users-store";
import { BlockedActionDialog } from "@/features/admin/users/dialogs/blocked-action-dialog";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { CampusGateBanner } from "@/features/campus/components/campus-gate-banner";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
// ClassDialog imports the teaching assignments editor (which subscribes
// to users + subjects + teaching stores) — defer until actually opened.
const ClassDialog = dynamic(
  () =>
    import("@/features/grades/dialogs/class-dialog").then(
      (m) => m.ClassDialog,
    ),
  { ssr: false, loading: () => null },
);
const GradeDialog = dynamic(
  () =>
    import("@/features/grades/dialogs/grade-dialog").then(
      (m) => m.GradeDialog,
    ),
  { ssr: false, loading: () => null },
);
import type { Grade, SchoolClass } from "@/features/grades/data/seed-grades";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useTeachingStore } from "@/features/teaching/state/teaching-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

interface GradeDeps {
  classCount: number;
  studentCount: number;
  userCount: number;
  questionCount: number;
}

interface ClassDeps {
  studentCount: number;
  userCount: number;
}

export default function GradesAdminPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const grades = useGradesStore((s) => s.grades);
  const classes = useGradesStore((s) => s.classes);
  const removeGrade = useGradesStore((s) => s.removeGrade);
  const removeClass = useGradesStore((s) => s.removeClass);
  const removeTeachingByClass = useTeachingStore((s) => s.removeByClass);
  const users = useUsersStore((s) => s.users);
  const campuses = useCampusesStore((s) => s.campuses);
  const { canMutate } = useCampusGate();

  // When a campus is pinned (superadmin operating mode or staff locked to
  // Scope rules:
  //  - Pinned campus (or non-superadmin's locked campus) → show that
  //    campus's gradeIds only.
  //  - Superadmin with no pin → show the *union* of every campus's
  //    gradeIds (only grades actually in use by at least one campus).
  //    This stops K10-K12 from appearing when the only campus in the
  //    system is a primary-secondary one with gradeIds = K1-K9.
  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const operatingCampus = useMemo(
    () =>
      operatingCampusId
        ? campuses.find((c) => c.id === operatingCampusId) ?? null
        : null,
    [operatingCampusId, campuses],
  );
  const scopedGradeIds = useMemo(() => {
    if (operatingCampus) return new Set(operatingCampus.gradeIds);
    // Superadmin no-pin path — union across campuses. Empty union
    // (no campuses yet) falls back to null = "show all" so the first
    // admin can still see the global K1–K12 list to set things up.
    if (campuses.length === 0) return null;
    const union = new Set<string>();
    for (const c of campuses) {
      for (const gid of c.gradeIds ?? []) union.add(gid);
    }
    return union.size > 0 ? union : null;
  }, [operatingCampus, campuses]);

  const [tab, setTab] = useState<"grade" | "class">("grade");
  const [search, setSearch] = useState("");
  const [classGradeFilter, setClassGradeFilter] = useState<string>("all");
  const [classStatusFilter, setClassStatusFilter] = useState<string>("all");

  // Dialog state
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [presetGradeId, setPresetGradeId] = useState<string | null>(null);
  const [deleteGradeTarget, setDeleteGradeTarget] = useState<Grade | null>(null);
  const [deleteClassTarget, setDeleteClassTarget] = useState<SchoolClass | null>(null);
  const [blockedGrade, setBlockedGrade] = useState<{ grade: Grade; deps: GradeDeps } | null>(null);
  const [blockedClass, setBlockedClass] = useState<{ klass: SchoolClass; deps: ClassDeps } | null>(null);

  function gradeDependencies(grade: Grade): GradeDeps {
    const cs = classes.filter((c) => c.gradeId === grade.id);
    const classCodes = new Set(cs.map((c) => c.code));
    // Use live student count derived from actual user records — the
    // legacy `class.studentCount` field has drifted from reality.
    const userCount = users.filter(
      (u) =>
        u.role === "student" &&
        u.className &&
        classCodes.has(u.className),
    ).length;
    return {
      classCount: cs.length,
      studentCount: userCount,
      userCount,
      questionCount: 0,
    };
  }

  function classDependencies(klass: SchoolClass): ClassDeps {
    const userCount = users.filter(
      (u) =>
        u.role === "student" &&
        u.className === klass.code &&
        u.campusId === klass.campusId,
    ).length;
    return {
      studentCount: userCount,
      userCount,
    };
  }

  function handleDeleteGrade(grade: Grade) {
    const deps = gradeDependencies(grade);
    const blocked =
      deps.classCount > 0 ||
      deps.studentCount > 0 ||
      deps.userCount > 0 ||
      deps.questionCount > 0;
    if (blocked) setBlockedGrade({ grade, deps });
    else setDeleteGradeTarget(grade);
  }

  function handleDeleteClass(klass: SchoolClass) {
    const deps = classDependencies(klass);
    if (deps.studentCount > 0 || deps.userCount > 0) {
      setBlockedClass({ klass, deps });
    } else {
      setDeleteClassTarget(klass);
    }
  }

  const scopedClasses = useMemo(() => {
    if (!session) return [];
    if (session.role === "campus-admin") {
      return classes.filter((c) => c.campusId === session.campusId);
    }
    if (activeCampusId) return classes.filter((c) => c.campusId === activeCampusId);
    return classes;
  }, [classes, session, activeCampusId]);

  // Map every class id → its live student count (from users-store). This
  // is the single source of truth used by every row / KPI / dependency
  // check on this page. `class.studentCount` is treated as legacy data.
  const liveStudentCountByClassId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classes) {
      const count = users.filter(
        (u) =>
          u.role === "student" &&
          u.className === c.code &&
          u.campusId === c.campusId,
      ).length;
      m.set(c.id, count);
    }
    return m;
  }, [classes, users]);

  const gradeRows = useMemo(() => {
    return grades
      .filter((g) => (scopedGradeIds ? scopedGradeIds.has(g.id) : true))
      .map((g) => {
        const inScope = scopedClasses.filter((c) => c.gradeId === g.id);
        return {
          ...g,
          scopedClassCount: inScope.length,
          scopedStudentCount: inScope.reduce(
            (acc, c) => acc + (liveStudentCountByClassId.get(c.id) ?? 0),
            0,
          ),
        };
      });
  }, [grades, scopedClasses, scopedGradeIds, liveStudentCountByClassId]);

  const filteredGrades = useMemo(() => {
    if (!search.trim()) return gradeRows;
    const q = search.trim().toLowerCase();
    return gradeRows.filter((g) => `${g.name} ${g.code}`.toLowerCase().includes(q));
  }, [gradeRows, search]);

  const filteredClasses = useMemo(() => {
    return scopedClasses.filter((c) => {
      if (classGradeFilter !== "all" && c.gradeId !== classGradeFilter) return false;
      if (classStatusFilter !== "all" && c.status !== classStatusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${c.name} ${c.code} ${c.homeroomTeacher}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedClasses, classGradeFilter, classStatusFilter, search]);

  const totalGrades = gradeRows.length;
  const totalClasses = scopedClasses.length;
  const totalStudents = scopedClasses.reduce(
    (acc, c) => acc + (liveStudentCountByClassId.get(c.id) ?? 0),
    0,
  );
  const totalHomerooms = new Set(scopedClasses.map((c) => c.homeroomTeacher)).size;
  const isSuperadmin = session?.role === "superadmin";

  return (
    <>
      <PageHeader
        title="Quản lý khối, lớp"
        description="Tổ chức và quản lý các khối / lớp học trong FSchools"
        actions={
          <>
            {/* "Thêm khối" intentionally removed — the global K1–K12
                 catalog is fixed and each campus inherits its visible
                 subset via `gradeIdsForTier(campus.tier)`. To change a
                 campus's grade coverage, edit its tier instead. */}
            <Button
              size="sm"
              onClick={() => {
                setEditingClass(null);
                setPresetGradeId(null);
                setClassDialogOpen(true);
              }}
              disabled={!canMutate}
              title={!canMutate ? "Chọn 1 campus để thêm lớp" : undefined}
            >
              <Plus className="h-4 w-4" />
              Thêm lớp
            </Button>
          </>
        }
      />

      <CampusGateBanner />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tất cả khối" value={totalGrades} icon={LayoutGrid} tone="blue" />
        <KpiCard label="Tất cả lớp" value={totalClasses.toLocaleString("vi-VN")} icon={School} tone="orange" />
        <KpiCard label="Tổng số học sinh" value={totalStudents.toLocaleString("vi-VN")} icon={UsersIcon} tone="green" />
        <KpiCard label="GV chủ nhiệm" value={totalHomerooms} icon={UserCog} tone="violet" />
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "grade" | "class")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="grade">
              <LayoutGrid className="h-3.5 w-3.5" /> Khối
            </TabsTrigger>
            <TabsTrigger value="class">
              <School className="h-3.5 w-3.5" /> Lớp
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "grade" ? "Tìm khối…" : "Tìm lớp, GVCN…"}
              className="h-9 w-64"
            />
            {tab === "class" && (
              <>
                <Select
                  value={classGradeFilter}
                  onChange={(e) => setClassGradeFilter(e.target.value)}
                  className="h-9 min-w-[120px]"
                >
                  <option value="all">Khối: Tất cả</option>
                  {grades
                    .filter((g) =>
                      scopedGradeIds ? scopedGradeIds.has(g.id) : true,
                    )
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        Khối: {g.name}
                      </option>
                    ))}
                </Select>
                <Select
                  value={classStatusFilter}
                  onChange={(e) => setClassStatusFilter(e.target.value)}
                  className="h-9 min-w-[130px]"
                >
                  <option value="all">Trạng thái: Tất cả</option>
                  <option value="active">Đang hoạt động</option>
                  <option value="archived">Đã lưu trữ</option>
                </Select>
              </>
            )}
          </div>
        </div>

        <TabsContent value="grade">
          <GradeTable
            rows={filteredGrades}
            onEdit={(g) => {
              setEditingGrade(g);
              setGradeDialogOpen(true);
            }}
            onDelete={handleDeleteGrade}
            onAddClass={(g) => {
              setEditingClass(null);
              setPresetGradeId(g.id);
              setClassDialogOpen(true);
            }}
            canDelete={isSuperadmin}
          />
        </TabsContent>

        <TabsContent value="class">
          <ClassTable
            rows={filteredClasses}
            onEdit={(c) => {
              setEditingClass(c);
              setClassDialogOpen(true);
            }}
            onDelete={handleDeleteClass}
          />
        </TabsContent>
      </Tabs>

      <GradeDialog
        open={gradeDialogOpen}
        onOpenChange={setGradeDialogOpen}
        editing={editingGrade}
      />
      <ClassDialog
        open={classDialogOpen}
        onOpenChange={setClassDialogOpen}
        editing={editingClass}
        presetGradeId={presetGradeId}
      />

      <BlockedActionDialog
        open={Boolean(blockedGrade)}
        onOpenChange={(o) => !o && setBlockedGrade(null)}
        title="Không thể xoá khối"
        intro={
          blockedGrade ? (
            <>
              Khối{" "}
              <span className="font-semibold text-foreground">{blockedGrade.grade.name}</span>{" "}
              đang được sử dụng:
            </>
          ) : null
        }
        reasons={
          blockedGrade
            ? [
                `${blockedGrade.deps.classCount.toLocaleString("vi-VN")} lớp`,
                `${blockedGrade.deps.studentCount.toLocaleString("vi-VN")} học sinh`,
                `${blockedGrade.deps.userCount.toLocaleString("vi-VN")} người dùng`,
                `${blockedGrade.deps.questionCount.toLocaleString("vi-VN")} câu hỏi`,
              ].filter((s) => !s.startsWith("0 "))
            : []
        }
      />

      <BlockedActionDialog
        open={Boolean(blockedClass)}
        onOpenChange={(o) => !o && setBlockedClass(null)}
        title="Không thể xoá lớp"
        intro={
          blockedClass ? (
            <>
              Lớp{" "}
              <span className="font-semibold text-foreground">{blockedClass.klass.name}</span>{" "}
              đang có dữ liệu:
            </>
          ) : null
        }
        reasons={
          blockedClass
            ? [
                `${blockedClass.deps.studentCount.toLocaleString("vi-VN")} học sinh`,
                `${blockedClass.deps.userCount.toLocaleString("vi-VN")} người dùng`,
              ].filter((s) => !s.startsWith("0 "))
            : []
        }
      />

      <ConfirmActionDialog
        open={Boolean(deleteGradeTarget)}
        onOpenChange={(o) => !o && setDeleteGradeTarget(null)}
        variant="destructive"
        title="Xoá khối học?"
        description={
          deleteGradeTarget ? (
            <>
              Khối <span className="font-medium text-foreground/85">{deleteGradeTarget.name}</span>{" "}
              chưa được sử dụng. Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá khối"
        onConfirm={() => deleteGradeTarget && removeGrade(deleteGradeTarget.id)}
      />

      <ConfirmActionDialog
        open={Boolean(deleteClassTarget)}
        onOpenChange={(o) => !o && setDeleteClassTarget(null)}
        variant="destructive"
        title="Xoá lớp?"
        description={
          deleteClassTarget ? (
            <>
              Xoá lớp <span className="font-medium text-foreground/85">{deleteClassTarget.name}</span>.
              Hành động không thể hoàn tác.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá lớp"
        onConfirm={() => {
          if (!deleteClassTarget) return;
          // Cascade: drop teaching assignments tied to the class as well so
          // we don't leave orphan rows referencing a deleted class.
          removeTeachingByClass(deleteClassTarget.id);
          removeClass(deleteClassTarget.id);
        }}
      />
    </>
  );
}

/* ─────────────────────────── tables ─────────────────────────── */

interface GradeRowExtra extends Grade {
  scopedClassCount: number;
  scopedStudentCount: number;
}

function GradeTable({
  rows,
  onEdit,
  onDelete,
  onAddClass,
  canDelete,
}: {
  rows: GradeRowExtra[];
  onEdit: (g: Grade) => void;
  onDelete: (g: Grade) => void;
  onAddClass: (g: Grade) => void;
  canDelete: boolean;
}) {
  if (rows.length === 0) {
    return <EmptyState label="Chưa có khối nào." />;
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Khối</TableHead>
            <TableHead>Mã khối</TableHead>
            <TableHead>Số lớp</TableHead>
            <TableHead>Số học sinh</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => (
            <TableRow key={g.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-200">
                    <GraduationCap className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="text-card-title">{g.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-[12px] text-foreground/75">{g.code}</span>
              </TableCell>
              <TableCell className="tabular-nums">{g.scopedClassCount}</TableCell>
              <TableCell className="tabular-nums">{g.scopedStudentCount.toLocaleString("vi-VN")}</TableCell>
              <TableCell>
                <StatusChip status={g.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddClass(g)}
                    title="Thêm lớp"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm lớp
                  </button>
                  <IconButton variant="primary" title="Chỉnh sửa" onClick={() => onEdit(g)}>
                    <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                  </IconButton>
                  {canDelete && (
                    <IconButton
                      variant="destructive"
                      title="Xoá khối"
                      onClick={() => onDelete(g)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClassTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: SchoolClass[];
  onEdit: (c: SchoolClass) => void;
  onDelete: (c: SchoolClass) => void;
}) {
  const grades = useGradesStore((s) => s.grades);
  const campuses = useCampusesStore((s) => s.campuses);
  const users = useUsersStore((s) => s.users);
  // Live student count per class — same logic as the page-level map.
  const liveCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rows) {
      m.set(
        c.id,
        users.filter(
          (u) =>
            u.role === "student" &&
            u.className === c.code &&
            u.campusId === c.campusId,
        ).length,
      );
    }
    return m;
  }, [rows, users]);
  if (rows.length === 0) {
    return <EmptyState label="Chưa có lớp nào phù hợp với bộ lọc." />;
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Lớp</TableHead>
            <TableHead>Khối</TableHead>
            <TableHead>GV chủ nhiệm</TableHead>
            <TableHead>Sĩ số</TableHead>
            <TableHead>Campus</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const grade = grades.find((g) => g.id === c.gradeId);
            const campus = campuses.find((cc) => cc.id === c.campusId);
            return (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                      <School className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="leading-tight">
                      <p className="text-card-title">{c.name}</p>
                      <p className="text-meta font-mono">{c.code}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/75">
                    {grade?.code ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <p>{c.homeroomTeacher || <span className="text-muted-foreground italic">Chưa phân công</span>}</p>
                  <TeachingCountBadge classId={c.id} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {liveCount.get(c.id) ?? 0}
                </TableCell>
                <TableCell>
                  {campus ? (
                    <span className="text-foreground/80">{campus.name.replace(/^FSchools /, "")}</span>
                  ) : (
                    <span className="text-meta">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip status={c.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <IconButton variant="primary" title="Chỉnh sửa" onClick={() => onEdit(c)}>
                      <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      variant="destructive"
                      title="Xoá lớp"
                      onClick={() => onDelete(c)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TeachingCountBadge({ classId }: { classId: string }) {
  // Light selector — only the count, not the whole array, so the row only
  // re-renders when *this* class's row count changes.
  const count = useTeachingStore((s) =>
    s.assignments.reduce((n, a) => (a.classId === classId ? n + 1 : n), 0),
  );
  if (count === 0) return null;
  return (
    <p className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
      🎓 {count} GV giảng dạy
    </p>
  );
}

function StatusChip({ status }: { status: "active" | "archived" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
        status === "active"
          ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
      {status === "active" ? "Hoạt động" : "Lưu trữ"}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <p className="text-section-title">{label}</p>
      <p className="text-small mt-1 text-muted-foreground">Thử thay đổi bộ lọc hoặc thêm mới.</p>
    </div>
  );
}
