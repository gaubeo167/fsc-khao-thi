"use client";

import { useMemo } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  effectiveShiftStatus,
  type ExamShift,
  type ShiftStatus,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";

export interface MyShift {
  shift: ExamShift;
  effectiveStatus: ShiftStatus;
  /** Room (if any) the student was placed into via Step 4 assignment. */
  roomName: string | null;
  /** Class id that brought the student into this shift. */
  classId: string | null;
}

/**
 * Resolve every shift the currently signed-in *student* is eligible for.
 *
 * Strict roster rule: the student MUST be listed explicitly in
 * `room.studentIds` for the shift. This freezes the roster at shift
 * creation time — adding a student to a class AFTER the shift was
 * created doesn't auto-grant them entry. Admin must add the student
 * to a room via the wizard's edit flow.
 *
 * (Previously there was a legacy `className`-join fallback that
 * auto-included anyone whose className matched a shift's classIds.
 * Per requirement "Học sinh tạo mới được gán vào lớp sau khi ca thi
 * đã tạo sẽ không được vào thi", that fallback is gone.)
 */
export function useMyShifts(): MyShift[] {
  const session = useAuthStore((s) => s.session);
  const shifts = useShiftsStore((s) => s.shifts);
  const classes = useGradesStore((s) => s.classes);
  const users = useUsersStore((s) => s.users);

  return useMemo(() => {
    if (!session || session.role !== "student") return [];
    const studentId = session.userId;
    const myUser = users.find((u) => u.id === studentId);
    const className = myUser?.className ?? null;
    const myClasses = classes.filter(
      (c) => c.campusId === session.campusId,
    );
    const out: MyShift[] = [];
    for (const sh of shifts) {
      if (sh.campusId !== session.campusId) continue;

      // Find the room listing the student explicitly. Without one,
      // the student is NOT eligible — roster is frozen at create time.
      const explicitRoom = sh.rooms.find((r) =>
        (r.studentIds ?? []).includes(studentId),
      );
      if (!explicitRoom) continue;
      // The room's classIds may carry one or more classes — pick the
      // one matching this student's className if possible.
      const classId: string | null =
        (className
          ? myClasses.find(
              (c) =>
                c.code === className &&
                explicitRoom.classIds.includes(c.id),
            )?.id
          : null) ??
        explicitRoom.classIds[0] ??
        null;

      out.push({
        shift: sh,
        effectiveStatus: effectiveShiftStatus(sh),
        roomName: explicitRoom?.name ?? null,
        classId,
      });
    }
    // Sort: in-progress first, then upcoming by startAt asc, then completed
    // by endAt desc.
    out.sort((a, b) => {
      const order: Record<ShiftStatus, number> = {
        "in-progress": 0,
        scheduled: 1,
        draft: 2,
        completed: 3,
        cancelled: 4,
      };
      const oa = order[a.effectiveStatus];
      const ob = order[b.effectiveStatus];
      if (oa !== ob) return oa - ob;
      if (a.effectiveStatus === "completed") {
        return (
          new Date(b.shift.endAt).getTime() -
          new Date(a.shift.endAt).getTime()
        );
      }
      return (
        new Date(a.shift.startAt).getTime() -
        new Date(b.shift.startAt).getTime()
      );
    });
    return out;
  }, [session, shifts, classes, users]);
}
