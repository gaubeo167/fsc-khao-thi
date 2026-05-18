"use client";

import {
  ArrowDownAZ,
  ArrowDownZA,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Crown,
  KeyRound,
  Mail,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useUsersStore } from "@/features/admin/users/users-store";
import { ResetPasswordDialog } from "@/features/admin/users/dialogs/reset-password-dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { useTeachingStore } from "@/features/teaching/state/teaching-store";
import { cn } from "@/lib/utils";

export default function MyClassesPage() {
  const session = useAuthStore((s) => s.session);
  const classes = useGradesStore((s) => s.classes);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const users = useUsersStore((s) => s.users);
  const allAssignments = useTeachingStore((s) => s.assignments);

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Two views: class-cards (group by class, with badges) and a flat
  // sortable student table (better when managing many classes at once).
  const [view, setView] = useState<"classes" | "students">("classes");
  // Student-table filters.
  const [studentSearch, setStudentSearch] = useState("");
  const [studentGradeFilter, setStudentGradeFilter] = useState<string>("all");
  const [studentClassFilter, setStudentClassFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"name" | "code" | "class" | "id">(
    "name",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Teacher-initiated password reset target. Auth check is implicit:
  // /my-classes only resolves classes this teacher is responsible for,
  // so any student row rendered here is already in scope.
  const [resetTarget, setResetTarget] = useState<SeedUser | null>(null);

  // Resolve the classes this teacher is responsible for. A class can be
  // reached through ANY of these channels (the badges show which ones):
  //   1. Homeroom — `class.homeroomTeacherId === me`
  //   2. Teaching — teaching-store assignment (subject × class) matches me
  //   3. Grade supervision — `user.gradeIds` covers the class's grade
  //   4. Class supervision — `user.classIds` includes the class id
  //
  // (3) and (4) are the broader supervision channels that let a teacher
  // manage students even in classes they don't personally teach (e.g.
  // GVCN khối, người phụ trách lứa tuổi).
  const me = useMemo(
    () => (session ? users.find((u) => u.id === session.userId) : null),
    [session, users],
  );
  const myClasses = useMemo(() => {
    if (!session) return [];
    type Row = {
      classId: string;
      className: string;
      classCode: string;
      gradeName: string;
      homeroomTeacherName: string | null;
      isHomeroom: boolean;
      teachingSubjects: Array<{ id: string; name: string }>;
      supervisesGrade: boolean;
      supervisesClass: boolean;
      studentCount: number;
      campusId: string;
    };
    const gradeIdSet = new Set(me?.gradeIds ?? []);
    const classIdSet = new Set(me?.classIds ?? []);
    const mine: Row[] = [];
    for (const c of classes) {
      if (session.role !== "superadmin" && c.campusId !== session.campusId)
        continue;
      const isHomeroom = c.homeroomTeacherId === session.userId;
      const teachingForClass = allAssignments.filter(
        (a) => a.classId === c.id && a.teacherId === session.userId,
      );
      const teachingSubjects = teachingForClass
        .map((a) => subjects.find((s) => s.id === a.subjectId))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ id: s.id, name: s.name }));
      const supervisesGrade = gradeIdSet.has(c.gradeId);
      const supervisesClass = classIdSet.has(c.id);
      // Show the class if ANY relationship channel applies.
      if (
        !isHomeroom &&
        teachingSubjects.length === 0 &&
        !supervisesGrade &&
        !supervisesClass
      ) {
        continue;
      }
      const grade = grades.find((g) => g.id === c.gradeId);
      const homeroomTeacher = c.homeroomTeacherId
        ? users.find((u) => u.id === c.homeroomTeacherId)
        : null;
      const studentCount = users.filter(
        (u) =>
          u.role === "student" &&
          u.status === "active" &&
          u.className === c.code &&
          u.campusId === c.campusId,
      ).length;
      mine.push({
        classId: c.id,
        className: c.name,
        classCode: c.code,
        gradeName: grade?.name ?? "—",
        homeroomTeacherName: homeroomTeacher?.name ?? c.homeroomTeacher ?? null,
        isHomeroom,
        teachingSubjects,
        supervisesGrade,
        supervisesClass,
        studentCount,
        campusId: c.campusId,
      });
    }
    return mine.sort((a, b) =>
      a.classCode.localeCompare(b.classCode, "vi", { numeric: true }),
    );
  }, [session, me, classes, allAssignments, subjects, users, grades]);

  const filtered = useMemo(() => {
    if (!search.trim()) return myClasses;
    const q = search.trim().toLowerCase();
    return myClasses.filter(
      (r) =>
        r.className.toLowerCase().includes(q) ||
        r.classCode.toLowerCase().includes(q) ||
        r.gradeName.toLowerCase().includes(q) ||
        r.teachingSubjects.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [myClasses, search]);

  // ───── Flat student table — every student whose class the teacher
  // supervises. The class scope here is the SAME `myClasses` set, so the
  // table can never expose someone outside the teacher's authority.
  const allMyStudents = useMemo(() => {
    if (!session) return [];
    const classByCode = new Map<string, (typeof classes)[number]>();
    for (const c of classes) classByCode.set(c.code, c);
    const myClassCodes = new Set(myClasses.map((r) => r.classCode));
    const myClassIds = new Set(myClasses.map((r) => r.classId));
    return users
      .filter(
        (u) =>
          u.role === "student" &&
          u.campusId ===
            (session.role === "superadmin" ? u.campusId : session.campusId) &&
          u.className != null &&
          myClassCodes.has(u.className),
      )
      .map((u) => {
        const cls = u.className ? classByCode.get(u.className) : null;
        const grade = cls ? grades.find((g) => g.id === cls.gradeId) : null;
        return {
          user: u,
          className: u.className ?? "—",
          classId: cls?.id ?? "",
          gradeId: cls?.gradeId ?? "",
          gradeName: grade?.name ?? "—",
        };
      })
      .filter((row) => row.classId === "" || myClassIds.has(row.classId));
  }, [session, users, classes, grades, myClasses]);

  // Grade / class dropdowns are scoped to the teacher's classes — they
  // never see filter options for classes they don't own.
  const studentFilterGrades = useMemo(() => {
    const ids = new Set(myClasses.map((r) => r.gradeName));
    return grades.filter((g) => ids.has(g.name));
  }, [grades, myClasses]);
  const studentFilterClasses = useMemo(() => {
    return myClasses.filter(
      (r) =>
        studentGradeFilter === "all" ||
        // Translate the gradeName-based myClasses row back to gradeId via
        // a lookup. Cheap since myClasses is small.
        grades.find((g) => g.name === r.gradeName)?.id ===
          studentGradeFilter,
    );
  }, [myClasses, grades, studentGradeFilter]);

  function vietnameseGivenName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1] ?? fullName;
  }

  const filteredStudents = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return allMyStudents
      .filter((row) => {
        if (studentGradeFilter !== "all" && row.gradeId !== studentGradeFilter)
          return false;
        if (studentClassFilter !== "all" && row.classId !== studentClassFilter)
          return false;
        if (studentSearch.trim()) {
          const q = studentSearch.trim().toLowerCase();
          if (
            !row.user.name.toLowerCase().includes(q) &&
            !row.user.id.toLowerCase().includes(q) &&
            !(row.user.email ?? "").toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === "name") {
          return (
            vietnameseGivenName(a.user.name).localeCompare(
              vietnameseGivenName(b.user.name),
              "vi",
              { sensitivity: "base" },
            ) * dir
          );
        }
        if (sortKey === "code") {
          return (
            a.className.localeCompare(b.className, "vi", { numeric: true }) *
            dir
          );
        }
        if (sortKey === "id") {
          return a.user.id.localeCompare(b.user.id, "vi") * dir;
        }
        return (
          a.user.name.localeCompare(b.user.name, "vi") * dir
        );
      });
  }, [
    allMyStudents,
    studentGradeFilter,
    studentClassFilter,
    studentSearch,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Aggregate KPIs.
  const kpis = useMemo(() => {
    const totalStudents = myClasses.reduce((a, r) => a + r.studentCount, 0);
    const homeroomCount = myClasses.filter((r) => r.isHomeroom).length;
    const subjectsTaught = new Set(
      myClasses.flatMap((r) => r.teachingSubjects.map((s) => s.id)),
    );
    return {
      classCount: myClasses.length,
      totalStudents,
      homeroomCount,
      subjectsTaught: subjectsTaught.size,
    };
  }, [myClasses]);

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!session) return null;
  if (!["teacher", "subject-lead"].includes(session.role)) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này dành cho giáo viên / TBM. Vai trò Admin có thể quản lý toàn
        bộ ở mục "Khối · lớp".
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp bạn đang chủ nhiệm hoặc được giao giảng dạy."
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="LỚP ĐANG PHỤ TRÁCH"
          value={kpis.classCount}
          tone="blue"
        />
        <KpiTile
          icon={<Crown className="h-4 w-4" />}
          label="LỚP CHỦ NHIỆM"
          value={kpis.homeroomCount}
          tone="emerald"
          hint={kpis.homeroomCount === 0 ? "Không có" : "Chủ nhiệm"}
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label="TỔNG HS"
          value={kpis.totalStudents}
          tone="violet"
        />
        <KpiTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="SỐ MÔN DẠY"
          value={kpis.subjectsTaught}
          tone="amber"
        />
      </section>

      {/* View tabs — classes (cards) vs students (flat table) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("classes")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition",
              view === "classes"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-accent/30",
            )}
          >
            <Users className="mr-1 inline h-3.5 w-3.5" />
            Lớp của tôi
          </button>
          <button
            type="button"
            onClick={() => setView("students")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition",
              view === "students"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-accent/30",
            )}
          >
            <ArrowDownAZ className="mr-1 inline h-3.5 w-3.5" />
            Học sinh ({allMyStudents.length})
          </button>
        </div>
        {view === "classes" ? (
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm lớp / khối / môn…"
              className="h-9 w-64 pl-8"
            />
          </div>
        ) : (
          <>
            <select
              value={studentGradeFilter}
              onChange={(e) => {
                setStudentGradeFilter(e.target.value);
                setStudentClassFilter("all");
              }}
              className="h-9 rounded-md border bg-card px-2 text-[12.5px]"
            >
              <option value="all">Khối: Tất cả</option>
              {studentFilterGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              value={studentClassFilter}
              onChange={(e) => setStudentClassFilter(e.target.value)}
              disabled={studentGradeFilter === "all"}
              title={
                studentGradeFilter === "all"
                  ? "Chọn khối trước rồi mới lọc theo lớp"
                  : undefined
              }
              className="h-9 rounded-md border bg-card px-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">
                {studentGradeFilter === "all"
                  ? "Lớp: chọn khối trước"
                  : "Lớp: Tất cả"}
              </option>
              {studentFilterClasses.map((r) => (
                <option key={r.classId} value={r.classId}>
                  {r.className}
                </option>
              ))}
            </select>
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Tìm theo tên / mã / email HS…"
                className="h-9 w-72 pl-8"
              />
            </div>
          </>
        )}
      </div>

      {view === "students" ? (
        <StudentTable
          students={filteredStudents}
          totalStudents={allMyStudents.length}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onResetPassword={(stu) => setResetTarget(stu)}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {myClasses.length === 0
              ? "Bạn chưa được giao lớp nào"
              : "Không có lớp khớp tìm kiếm"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {myClasses.length === 0
              ? "Admin campus sẽ gán bạn vào lớp (chủ nhiệm hoặc giảng dạy) khi sắp xếp xong."
              : "Thử đổi từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const isExpanded = expanded.has(row.classId);
            return (
              <li key={row.classId}>
                <div className="rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => toggle(row.classId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/10"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[14px] font-bold text-blue-700">
                      {row.classCode}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[13.5px] font-semibold">
                          {row.className}
                        </p>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                          {row.gradeName}
                        </span>
                        {row.isHomeroom && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] font-bold text-emerald-800">
                            <Crown className="h-3 w-3" /> Chủ nhiệm
                          </span>
                        )}
                        {row.supervisesGrade && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0 text-[10px] font-bold text-violet-800"
                            title="Bạn được giao quản lý toàn bộ HS thuộc khối này"
                          >
                            🏫 Quản lý khối
                          </span>
                        )}
                        {row.supervisesClass && !row.supervisesGrade && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-bold text-amber-800"
                            title="Bạn được giao quản lý HS lớp này (không phải toàn khối)"
                          >
                            👥 Quản lý lớp
                          </span>
                        )}
                        {row.teachingSubjects.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-blue-100 px-1.5 py-0 text-[10px] font-semibold text-blue-800"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {row.studentCount} HS · GVCN:{" "}
                        <b>
                          {row.homeroomTeacherName ?? "Chưa phân công"}
                        </b>
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <ClassStudentsList
                      classCode={row.classCode}
                      campusId={row.campusId}
                      onResetPassword={(stu) => setResetTarget(stu)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ResetPasswordDialog
        user={resetTarget}
        onClose={() => setResetTarget(null)}
      />
    </>
  );
}

function StudentTable({
  students,
  totalStudents,
  sortKey,
  sortDir,
  onToggleSort,
  onResetPassword,
}: {
  students: Array<{
    user: SeedUser;
    className: string;
    classId: string;
    gradeId: string;
    gradeName: string;
  }>;
  totalStudents: number;
  sortKey: "name" | "code" | "class" | "id";
  sortDir: "asc" | "desc";
  onToggleSort(key: "name" | "code" | "class" | "id"): void;
  onResetPassword(student: SeedUser): void;
}) {
  if (totalStudents === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-[14px] font-semibold">
          Chưa có HS nào thuộc phạm vi quản lý
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Khi bạn được giao thêm khối / lớp, danh sách HS sẽ xuất hiện ở đây.
        </p>
      </div>
    );
  }
  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-[14px] font-semibold">
          Không có HS khớp bộ lọc
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Thử bỏ bớt bộ lọc khối / lớp hoặc đổi từ khoá tìm kiếm.
        </p>
      </div>
    );
  }

  const SortIcon = sortDir === "asc" ? ArrowDownAZ : ArrowDownZA;
  function Header({
    label,
    sortable,
    sortKeyId,
    className,
  }: {
    label: string;
    sortable?: "name" | "code" | "class" | "id";
    sortKeyId?: "name" | "code" | "class" | "id";
    className?: string;
  }) {
    const active = sortable === sortKey;
    return (
      <th
        scope="col"
        className={cn(
          "border-b px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-foreground/65",
          sortable && "cursor-pointer select-none hover:bg-accent/30",
          className,
        )}
        onClick={sortable ? () => onToggleSort(sortable) : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {sortable && active && <SortIcon className="h-3 w-3 text-primary" />}
          {sortable && !active && (
            <span className="text-[10px] text-muted-foreground/60">↕</span>
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/20 px-4 py-2 text-[11.5px] text-muted-foreground">
        Hiển thị <b>{students.length}</b> / {totalStudents} HS · Mặc định
        sort theo <b>tên (chữ cuối) A→Z</b> — chuẩn danh sách Việt Nam.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr>
              <Header label="STT" />
              <Header label="Mã HS" sortable="id" />
              <Header label="Họ tên" sortable="name" />
              <Header label="Email" />
              <Header label="Khối" />
              <Header label="Lớp" sortable="code" />
              <Header label="Trạng thái" />
              <Header label="Hành động" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {students.map((row, idx) => {
              const u = row.user;
              const inactive = u.status !== "active";
              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-accent/10",
                    inactive && "bg-muted/20",
                  )}
                >
                  <td className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-foreground/80">
                    {u.id}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[9.5px] font-bold text-blue-700">
                        {(u.name.split(/\s+/).pop() ?? "?").charAt(0)}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          inactive && "italic text-muted-foreground",
                        )}
                      >
                        {u.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {u.email}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-foreground/65">
                      {row.gradeName}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-blue-100 px-1.5 py-0 text-[10.5px] font-semibold text-blue-800">
                      {row.className}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.status === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10.5px] font-semibold text-emerald-700">
                        ✓ Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0 text-[10.5px] font-semibold text-rose-700">
                        {u.status === "suspended" ? "Khoá" : u.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onResetPassword(u)}
                      title="Đổi mật khẩu cho HS này (hỗ trợ HS quên MK)"
                      className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      <KeyRound className="h-3 w-3" />
                      Đổi MK
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassStudentsList({
  classCode,
  campusId,
  onResetPassword,
}: {
  classCode: string;
  campusId: string;
  onResetPassword(student: SeedUser): void;
}) {
  const users = useUsersStore((s) => s.users);
  const students = useMemo(
    () =>
      users
        .filter(
          (u) =>
            u.role === "student" &&
            u.className === classCode &&
            u.campusId === campusId,
        )
        .sort((a, b) => {
          // Sort by last word of full name (Vietnamese convention).
          const givenA = (a.name.split(/\s+/).pop() ?? a.name).toLowerCase();
          const givenB = (b.name.split(/\s+/).pop() ?? b.name).toLowerCase();
          return givenA.localeCompare(givenB, "vi");
        }),
    [users, classCode, campusId],
  );

  return (
    <div className="border-t bg-muted/10 px-4 py-3">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-foreground/65">
        Danh sách HS ({students.length})
      </p>
      {students.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
          Lớp chưa có học sinh.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {students.map((s, idx) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[12px]"
            >
              <span className="w-5 text-right text-[10.5px] text-muted-foreground">
                {idx + 1}.
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[9.5px] font-bold text-blue-700">
                {(s.name.split(/\s+/).pop() ?? "?").charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate font-medium",
                    s.status !== "active" && "italic text-muted-foreground",
                  )}
                  title={s.email}
                >
                  {s.name}
                </p>
                <p className="truncate text-[9.5px] text-muted-foreground">
                  {s.email}
                </p>
              </div>
              {s.status !== "active" && (
                <span className="rounded-full bg-rose-100 px-1 text-[9px] font-bold text-rose-700">
                  {s.status === "suspended" ? "Khoá" : s.status}
                </span>
              )}
              {/* Teacher-only password reset — uses the same dialog as
                  the admin user manager. The teacher is implicitly
                  allowed because the page only renders their classes. */}
              <button
                type="button"
                onClick={() => onResetPassword(s)}
                title="Đổi mật khẩu cho HS này (hỗ trợ HS quên MK)"
                className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
              >
                🔑 MK
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          tones[tone],
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[24px] font-bold leading-none", tones[tone])}>
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
