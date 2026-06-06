"use client";

import { TrendingUp, X } from "lucide-react";
import { useMemo } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";

import { StudentProgressCard } from "../components/student-progress-card";
import { computeStudentProgress } from "../lib/compute-progress";

interface Props {
  studentId: string | null;
  onClose: () => void;
}

export function StudentProgressDialog({ studentId, onClose }: Props) {
  const users = useUsersStore((s) => s.users);
  const allShifts = useShiftsStore((s) => s.shifts);
  const allAttempts = useAttemptsStore((s) => s.attempts);
  const allHomework = useHomeworkStore((s) => s.homework);
  const allHwAttempts = useHomeworkAttemptsStore((s) => s.attempts);
  const allClasses = useGradesStore((s) => s.classes);

  const student = studentId
    ? users.find((u) => u.id === studentId) ?? null
    : null;

  // Resolve which shifts + homework this student WAS assigned to, so the
  // KPI denominators are "assigned" rather than "all in DB". Mirrors the
  // logic in /my-exams + /my-homework so the card reads the same as the
  // student's own dashboards.
  const studentClassIds = useMemo(() => {
    if (!student) return new Set<string>();
    const ids = new Set<string>();
    if (student.classIds) for (const id of student.classIds) ids.add(id);
    if (student.className) {
      const cn = student.className.trim().toLowerCase();
      for (const c of allClasses) {
        if (
          c.code.toLowerCase() === cn ||
          c.name.toLowerCase() === cn
        ) {
          ids.add(c.id);
        }
      }
    }
    return ids;
  }, [student, allClasses]);

  const assignedShifts = useMemo(() => {
    if (!student) return [];
    return allShifts.filter((sh) => {
      if (sh.campusId !== student.campusId) return false;
      return sh.rooms.some((r) =>
        (r.studentIds ?? []).includes(student.id),
      );
    });
  }, [allShifts, student]);

  const assignedHomework = useMemo(() => {
    if (!student) return [];
    return allHomework.filter((h) => {
      if (h.archivedAt) return false;
      if (h.status === "draft") return false;
      if (student.campusId && h.campusId !== student.campusId) return false;
      if (h.studentIds && h.studentIds.length > 0) {
        return h.studentIds.includes(student.id);
      }
      return h.classIds.some((cid) => studentClassIds.has(cid));
    });
  }, [allHomework, student, studentClassIds]);

  const progress = useMemo(() => {
    if (!student) return null;
    return computeStudentProgress({
      studentId: student.id,
      shifts: assignedShifts,
      attempts: allAttempts,
      homework: assignedHomework,
      homeworkAttempts: allHwAttempts,
    });
  }, [student, assignedShifts, allAttempts, assignedHomework, allHwAttempts]);

  return (
    <Dialog open={Boolean(studentId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <TrendingUp className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">
              Tiến độ học tập · {student?.name ?? "—"}
            </h2>
            <p className="text-meta mt-0.5">
              {student?.className
                ? `Lớp ${student.className}`
                : "Chưa gán lớp"}
              {" · "}
              {student?.email ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-2 py-1 text-[12px] font-medium hover:bg-accent"
          >
            <X className="inline h-3.5 w-3.5" /> Đóng
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {progress ? (
            <StudentProgressCard
              progress={progress}
              studentName={student?.name}
              audience="teacher"
            />
          ) : (
            <p className="py-10 text-center text-meta">
              Không tìm thấy học sinh.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
