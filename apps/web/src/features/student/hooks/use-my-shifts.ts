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
import {
  useAttemptsStore,
  type StudentAttempt,
} from "@/features/shift-exam/state/attempts-store";

/**
 * Học sinh NÀY đã làm gì với ca thi này. Khác với trạng thái của ca thi:
 * một ca đang diễn ra vẫn có thể là "đã nộp rồi" với riêng em này.
 */
export type ShiftAttendance =
  /** Vào thi rồi, chưa nộp — đồng hồ vẫn chạy. Gấp nhất. */
  | "doing"
  /** Đã nộp bài. */
  | "submitted"
  /** Ca đã đóng mà không có bài nào. */
  | "absent"
  /** Chưa đụng tới, ca vẫn còn cơ hội. */
  | "not-yet";

export interface MyShift {
  shift: ExamShift;
  effectiveStatus: ShiftStatus;
  /** Room (if any) the student was placed into via Step 4 assignment. */
  roomName: string | null;
  /** Class id that brought the student into this shift. */
  classId: string | null;
  /** MỘT nguồn sự thật cho "em này đã thi chưa" — thẻ ca thi đọc lại từ
   *  đây thay vì tự tính, để thứ tự sắp xếp và màu viền không bao giờ
   *  nói hai chuyện khác nhau. */
  attendance: ShiftAttendance;
  /** Bài làm của chính em này, nếu có. */
  attempt: StudentAttempt | undefined;
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
  const attempts = useAttemptsStore((s) => s.attempts);

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

      const status = effectiveShiftStatus(sh);
      const attempt = attempts.find(
        (a) => a.shiftId === sh.id && a.studentId === studentId,
      );
      const attendance: ShiftAttendance = attempt?.submittedAt
        ? "submitted"
        : attempt
          ? "doing"
          : status === "completed" || status === "cancelled"
            ? "absent"
            : "not-yet";

      out.push({
        shift: sh,
        effectiveStatus: status,
        roomName: explicitRoom?.name ?? null,
        classId,
        attendance,
        attempt,
      });
    }
    // ── Thứ tự: việc CẦN LÀM lên trên, việc đã xong xuống dưới ────────
    //
    // Sắp xếp cũ chỉ nhìn trạng thái của CA THI, không nhìn em này đã thi
    // chưa — nên một ca đang diễn ra mà em đã nộp bài vẫn nằm trên cùng,
    // đè lên ca em thật sự cần vào làm. Nay "đã nộp" bị đẩy xuống dưới mọi
    // ca còn phải làm, bất kể ca đó đang diễn ra hay không.
    const rank = (m: MyShift): number => {
      if (m.effectiveStatus === "cancelled") return 6;
      if (m.attendance === "submitted") {
        // Nộp rồi thì không còn là việc phải làm nữa.
        return m.effectiveStatus === "in-progress" ? 4 : 5;
      }
      if (m.effectiveStatus === "in-progress") {
        // Đang làm dở là gấp nhất — đồng hồ vẫn chạy.
        return m.attendance === "doing" ? 0 : 1;
      }
      if (m.effectiveStatus === "scheduled" || m.effectiveStatus === "draft") {
        return 2;
      }
      return 3; // ca đã đóng mà em không thi
    };
    out.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Còn phải làm → ca sắp tới nhất lên trước.
      if (ra <= 2) {
        return (
          new Date(a.shift.startAt).getTime() -
          new Date(b.shift.startAt).getTime()
        );
      }
      // Đã xong → ca gần đây nhất lên trước.
      return (
        new Date(b.shift.endAt).getTime() - new Date(a.shift.endAt).getTime()
      );
    });
    return out;
  }, [session, shifts, classes, users, attempts]);
}
