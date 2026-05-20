"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Role } from "@/features/auth/state/auth-store";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { ROLE_LABEL } from "./role-labels";

export interface UserFilters {
  query: string;
  role: Role | "all";
  status: SeedUser["status"] | "all";
  campusId: string | "all";
  /** Filter by subject — relevant for teacher / subject-lead. */
  subjectId: string | "all";
  /** Filter by grade — applies to teachers (gradeIds) AND students
   *  (mapped via their classIds → class.gradeId). */
  gradeId: string | "all";
  /** Filter by class — primarily for students. */
  classId: string | "all";
}

export const EMPTY_USER_FILTERS: UserFilters = {
  query: "",
  role: "all",
  status: "all",
  campusId: "all",
  subjectId: "all",
  gradeId: "all",
  classId: "all",
};

interface Props {
  filters: UserFilters;
  onChange: (next: UserFilters) => void;
  hideCampusFilter?: boolean;
  allowedRoles: Role[];
  /** Restrict the class dropdown to the current campus when set. */
  campusScopeId?: string | null;
}

export function UsersFilterBar({
  filters,
  onChange,
  hideCampusFilter,
  allowedRoles,
  campusScopeId,
}: Props) {
  const campuses = useCampusesStore((s) => s.campuses);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const classes = useGradesStore((s) => s.classes);
  const reset = () => onChange({ ...EMPTY_USER_FILTERS });
  const dirty =
    filters.query !== "" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.campusId !== "all" ||
    filters.subjectId !== "all" ||
    filters.gradeId !== "all" ||
    filters.classId !== "all";

  // Conditional visibility:
  //   - subject filter: teachers / subject-leads (or "all" view)
  //   - grade filter:   teachers / students / all
  //   - class filter:   students / all
  const showSubject =
    filters.role === "all" ||
    filters.role === "teacher" ||
    filters.role === "subject-lead";
  const showGrade =
    filters.role === "all" ||
    filters.role === "teacher" ||
    filters.role === "subject-lead" ||
    filters.role === "student";
  const showClass = filters.role === "all" || filters.role === "student";

  // Class dropdown narrows to the chosen grade + campus scope. Subjects
  // narrow to the campus too (multi-campus subjects show in either).
  const scopedSubjects = subjects.filter((s) =>
    campusScopeId
      ? Array.isArray(s.campusIds) && s.campusIds.includes(campusScopeId)
      : true,
  );
  const scopedClasses = classes.filter((c) => {
    if (campusScopeId && c.campusId !== campusScopeId) return false;
    if (filters.gradeId !== "all" && c.gradeId !== filters.gradeId) return false;
    return true;
  });

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <Input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Tìm theo tên, email hoặc mã người dùng…"
          className="h-9 pl-8"
        />
      </div>

      <ComboField label="Vai trò">
        <Select
          value={filters.role}
          onChange={(e) => onChange({ ...filters, role: e.target.value as Role | "all" })}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Tất cả</option>
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </ComboField>

      <ComboField label="Trạng thái">
        <Select
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as SeedUser["status"] | "all" })
          }
          className="h-9 min-w-[130px]"
        >
          <option value="all">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="invited">Đã mời</option>
          <option value="suspended">Tạm khoá</option>
        </Select>
      </ComboField>

      {!hideCampusFilter ? (
        <ComboField label="Campus">
          <Select
            value={filters.campusId}
            onChange={(e) => onChange({ ...filters, campusId: e.target.value })}
            className="h-9 min-w-[150px]"
          >
            <option value="all">Tất cả</option>
            {campuses
              .filter((c) => c.status === "active")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.replace(/^FSchools /, "")}
                </option>
              ))}
          </Select>
        </ComboField>
      ) : null}

      {showSubject ? (
        <ComboField label="Môn">
          <Select
            value={filters.subjectId}
            onChange={(e) =>
              onChange({ ...filters, subjectId: e.target.value })
            }
            className="h-9 min-w-[130px]"
          >
            <option value="all">Tất cả</option>
            {scopedSubjects
              .filter((s) => s.status === "active")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </ComboField>
      ) : null}

      {showGrade ? (
        <ComboField label="Khối">
          <Select
            value={filters.gradeId}
            onChange={(e) =>
              onChange({
                ...filters,
                gradeId: e.target.value,
                // Reset class when grade changes — a stale class id from
                // the prior grade would zero out the result list.
                classId: "all",
              })
            }
            className="h-9 min-w-[110px]"
          >
            <option value="all">Tất cả</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </ComboField>
      ) : null}

      {showClass ? (
        <ComboField label="Lớp">
          <Select
            value={filters.classId}
            onChange={(e) =>
              onChange({ ...filters, classId: e.target.value })
            }
            disabled={filters.gradeId === "all"}
            title={
              filters.gradeId === "all"
                ? "Chọn khối trước rồi mới lọc theo lớp"
                : undefined
            }
            className="h-9 min-w-[110px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="all">
              {filters.gradeId === "all" ? "Chọn khối trước" : "Tất cả"}
            </option>
            {scopedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </ComboField>
      ) : null}

      {dirty ? (
        <button
          type="button"
          onClick={reset}
          className="text-[12px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Xoá bộ lọc
        </button>
      ) : (
        <span className="text-meta hidden items-center gap-1 md:inline-flex">
          <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} />
          Bộ lọc
        </span>
      )}
    </div>
  );
}

function ComboField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-meta whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}
