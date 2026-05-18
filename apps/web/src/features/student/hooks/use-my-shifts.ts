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
 * A student belongs to a shift when either:
 *   1. They are listed explicitly in `room.studentIds` (new wizard), or
 *   2. They aren't listed anywhere yet but the shift's `classIds` covers
 *      a class whose `code` matches the student's `className` — this is
 *      the legacy fallback for shifts created before Step 4 saved
 *      student-level assignments.
 *
 * Campus scoping is enforced via `shift.campusId === session.campusId`.
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

      // Find the room (if any) listing the student explicitly.
      const explicitRoom = sh.rooms.find((r) =>
        (r.studentIds ?? []).includes(studentId),
      );
      let classId: string | null = null;
      if (!explicitRoom) {
        // Legacy: derive eligibility from shift.classIds + className join.
        const codes = new Set(
          myClasses
            .filter((c) => sh.classIds.includes(c.id))
            .map((c) => c.code),
        );
        const matched = className && codes.has(className);
        if (!matched) continue;
        classId =
          myClasses.find(
            (c) => c.code === className && sh.classIds.includes(c.id),
          )?.id ?? null;
      } else {
        // The room's classIds may carry one or more classes — pick the
        // one matching this student's className if possible.
        classId =
          (className
            ? myClasses.find(
                (c) =>
                  c.code === className &&
                  explicitRoom.classIds.includes(c.id),
              )?.id
            : null) ??
          explicitRoom.classIds[0] ??
          null;
      }

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
