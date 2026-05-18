"use client";

import { GraduationCap, Plus, Trash2, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { useTeachingStore } from "../state/teaching-store";

interface Props {
  classId: string;
  campusId: string;
  /** Restrict subject choices to a class's khối (so we don't offer Vật lý
   *  for a primary-school class for instance). */
  gradeId: string;
}

/**
 * Add/remove rows that say "teacher T dạy môn S cho lớp này". One teacher
 * can take multiple rows (multiple subjects per class), and the same
 * subject can have multiple co-teaching rows.
 */
export function TeachingAssignmentsEditor({
  classId,
  campusId,
  gradeId,
}: Props) {
  const users = useUsersStore((s) => s.users);
  const subjects = useSubjectsStore((s) => s.subjects);
  const assignments = useTeachingStore((s) => s.assignments);
  const addAssignment = useTeachingStore((s) => s.add);
  const removeAssignment = useTeachingStore((s) => s.remove);

  // Eligible teachers: staff role with active status in this campus.
  // When a subject is picked, also narrow by the teacher's authorised
  // `subjectIds` + `gradeIds` (legacy users without these arrays are still
  // accepted to avoid locking out historic accounts).
  const pendingSubjectFilterTeachers = (subjectId: string | null) =>
    users
      .filter((u) => {
        if (u.campusId !== campusId) return false;
        if (u.status !== "active") return false;
        if (u.role !== "teacher" && u.role !== "subject-lead") return false;
        if (subjectId && u.subjectIds && u.subjectIds.length > 0) {
          if (!u.subjectIds.includes(subjectId)) return false;
        }
        if (gradeId && u.gradeIds && u.gradeIds.length > 0) {
          if (!u.gradeIds.includes(gradeId)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  // Default (no subject filter) — used to show the empty-state hint.
  const eligibleTeachers = useMemo(
    () => pendingSubjectFilterTeachers(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, campusId, gradeId],
  );

  // Eligible subjects: assigned to this campus AND the class's grade.
  const eligibleSubjects = useMemo(
    () =>
      subjects
        .filter((s) => {
          if (s.status !== "active") return false;
          const inCampus =
            !s.campusIds ||
            s.campusIds.length === 0 ||
            s.campusIds.includes(campusId);
          if (!inCampus) return false;
          if (gradeId && s.gradeIds.length > 0)
            return s.gradeIds.includes(gradeId);
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [subjects, campusId, gradeId],
  );

  const rowsForClass = useMemo(
    () => assignments.filter((a) => a.classId === classId),
    [assignments, classId],
  );

  const [pendingSubjectId, setPendingSubjectId] = useState("");
  const [pendingTeacherId, setPendingTeacherId] = useState("");
  const [pendingError, setPendingError] = useState<string | null>(null);

  function commitAdd() {
    setPendingError(null);
    if (!pendingSubjectId || !pendingTeacherId) {
      setPendingError("Chọn cả môn và giáo viên trước khi thêm.");
      return;
    }
    const result = addAssignment({
      classId,
      subjectId: pendingSubjectId,
      teacherId: pendingTeacherId,
    });
    if (!result) {
      setPendingError(
        "Giáo viên này đã được phân công môn đó cho lớp này rồi.",
      );
      return;
    }
    setPendingSubjectId("");
    setPendingTeacherId("");
  }

  return (
    <section className="rounded-xl border bg-surface-2/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserCheck
          className="h-3.5 w-3.5 text-emerald-600"
          strokeWidth={2}
        />
        <p className="text-[13px] font-semibold text-foreground/85">
          Phân công giảng dạy{" "}
          <span className="text-meta font-normal">
            ({rowsForClass.length} dòng)
          </span>
        </p>
      </div>

      {/* Add row */}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select
          value={pendingSubjectId}
          onChange={(e) => setPendingSubjectId(e.target.value)}
          disabled={eligibleSubjects.length === 0}
        >
          <option value="">— Môn học —</option>
          {eligibleSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {(() => {
          const subjectFiltered = pendingSubjectFilterTeachers(
            pendingSubjectId || null,
          );
          return (
            <Select
              value={pendingTeacherId}
              onChange={(e) => setPendingTeacherId(e.target.value)}
              disabled={subjectFiltered.length === 0}
            >
              <option value="">
                {pendingSubjectId && subjectFiltered.length === 0
                  ? "Chưa có GV phụ trách môn này"
                  : "— Giáo viên —"}
              </option>
              {subjectFiltered.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.subject ? ` (${t.subject})` : ""}
                </option>
              ))}
            </Select>
          );
        })()}
        <Button
          type="button"
          size="sm"
          onClick={commitAdd}
          disabled={!pendingSubjectId || !pendingTeacherId}
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm
        </Button>
      </div>
      {pendingError && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">
          {pendingError}
        </p>
      )}

      {/* Empty / hint */}
      {eligibleTeachers.length === 0 && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Campus chưa có giáo viên. Tạo tài khoản giáo viên ở trang Người
          dùng trước.
        </p>
      )}

      {/* Existing rows */}
      {rowsForClass.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rowsForClass.map((row) => {
            const subj = subjects.find((s) => s.id === row.subjectId);
            const teacher = users.find((u) => u.id === row.teacherId);
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[12.5px]"
              >
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={
                    subj
                      ? {
                          backgroundColor: `${subj.color}1A`,
                          color: subj.color,
                        }
                      : undefined
                  }
                >
                  {subj?.code ?? "??"}
                </span>
                <span className="flex-1 truncate">
                  <span className="font-medium">{subj?.name ?? "—"}</span>
                  <span className="text-muted-foreground"> · GV: </span>
                  <span className="font-semibold text-foreground/85">
                    {teacher?.name ?? "(đã xoá)"}
                  </span>
                </span>
                <IconButton
                  size="sm"
                  variant="destructive"
                  title="Bỏ phân công"
                  onClick={() => removeAssignment(row.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      {rowsForClass.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[12px] text-muted-foreground">
          <GraduationCap
            className="mx-auto mb-1 h-4 w-4"
            strokeWidth={1.85}
          />
          Chưa có phân công môn nào. Chọn môn + giáo viên ở trên rồi bấm
          Thêm — 1 giáo viên có thể được phân nhiều môn khác nhau.
        </p>
      )}
    </section>
  );
}
