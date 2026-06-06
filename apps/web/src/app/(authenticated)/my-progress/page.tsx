"use client";

import { useMemo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";
import { PageHeader } from "@/features/shell/components/page-header";

import { StudentProgressCard } from "@/features/student-progress/components/student-progress-card";
import { computeStudentProgress } from "@/features/student-progress/lib/compute-progress";

/**
 * Student-facing self-report. Same StudentProgressCard the teacher
 * sees, but the AI persona is "student" so the verdict + observations
 * are written for the learner themselves (em / bạn pronouns, coaching
 * tone, suggested actions the student can take this week).
 */
export default function MyProgressPage() {
  const session = useAuthStore((s) => s.session);
  const allClasses = useGradesStore((s) => s.classes);
  const allShifts = useShiftsStore((s) => s.shifts);
  const allAttempts = useAttemptsStore((s) => s.attempts);
  const allHomework = useHomeworkStore((s) => s.homework);
  const allHwAttempts = useHomeworkAttemptsStore((s) => s.attempts);

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

  const myShifts = useMemo(() => {
    if (!session) return [];
    return allShifts.filter((sh) => {
      if (sh.campusId !== session.campusId) return false;
      return sh.rooms.some((r) =>
        (r.studentIds ?? []).includes(session.userId),
      );
    });
  }, [allShifts, session]);

  const myHomework = useMemo(() => {
    if (!session) return [];
    return allHomework.filter((h) => {
      if (h.archivedAt) return false;
      if (h.status === "draft") return false;
      if (session.campusId && h.campusId !== session.campusId) return false;
      if (h.studentIds && h.studentIds.length > 0) {
        return h.studentIds.includes(session.userId);
      }
      return h.classIds.some((cid) => myClassIds.has(cid));
    });
  }, [allHomework, session, myClassIds]);

  const progress = useMemo(() => {
    if (!session) return null;
    return computeStudentProgress({
      studentId: session.userId,
      shifts: myShifts,
      attempts: allAttempts,
      homework: myHomework,
      homeworkAttempts: allHwAttempts,
    });
  }, [session, myShifts, allAttempts, myHomework, allHwAttempts]);

  return (
    <>
      <PageHeader
        title="Tiến độ học tập của em"
        description="Tổng quan điểm thi, BTVN, và nhận xét AI về xu hướng học tập."
      />
      {progress ? (
        <StudentProgressCard progress={progress} audience="student" />
      ) : (
        <p className="text-meta">Đang tải…</p>
      )}
    </>
  );
}
