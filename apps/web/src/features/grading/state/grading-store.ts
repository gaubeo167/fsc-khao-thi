"use client";

import { where, type Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  removeDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

/**
 * Essay-grading data model
 * ─────────────────────────
 * Two collections live in Firestore for the grading workflow:
 *   1. `grading_assignments` — which teacher(s) are responsible for
 *      grading the essay questions of a given shift.
 *   2. `grades_essay` — per-question results entered by the assigned
 *      grader. Each row scores ONE student's ONE essay question.
 */

export interface GradingAssignment {
  id: string;
  shiftId: string;
  /** Grader user id (teacher / subject-lead). */
  graderId: string;
  /** Cached name so the queue doesn't need to re-query users. */
  graderName: string;
  /** User id of the admin who created this assignment. */
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
  /** Campus id of the shift — used by security rules. */
  campusId?: string | null;
  /** Optional free-text note for the grader. */
  note?: string | null;
  /**
   * Optional grading deadline (ISO string). After this moment the grader
   * may no longer create / edit / delete grades for this shift. Null or
   * absent = no time limit. Only an admin (who creates the assignment)
   * can set or change it.
   */
  deadline?: string | null;
}

export interface EssayGrade {
  id: string;
  attemptId: string;
  shiftId: string;
  studentId: string;
  questionId: string;
  graderId: string;
  graderName: string;
  /** Campus id of the shift — used by security rules. */
  campusId?: string | null;
  /** criterionId → points awarded (free-form 0..criterion.points). */
  rubricScores: Record<string, number>;
  /** Sum of `rubricScores` values — denormalised for queue display. */
  totalPoints: number;
  /** Maximum total points (sum of criterion.points). */
  maxPoints: number;
  /** Teacher's written feedback for the student. */
  comment: string;
  gradedAt: string;
  /**
   * Denormalised grading deadline (epoch milliseconds) copied from the
   * grader's assignment at write time. Lets Firestore security rules
   * enforce the cutoff by comparing with `request.time` WITHOUT a
   * cross-document read on the hot grading path. Null / absent = no
   * deadline (unlimited — the normal case).
   */
  gradingDeadlineMs?: number | null;
}

interface State {
  assignments: GradingAssignment[];
  grades: EssayGrade[];
  hydrated: boolean;
}

interface Actions {
  assignGrader(
    input: Omit<GradingAssignment, "id" | "assignedAt">,
  ): GradingAssignment;
  unassignGrader(id: string): void;
  gradersForShift(shiftId: string): GradingAssignment[];
  isAssigned(shiftId: string, graderId: string): boolean;
  /** ISO deadline for this grader on this shift, or null if none set. */
  deadlineForShiftGrader(shiftId: string, graderId: string): string | null;
  /** True once the grader's deadline for this shift has elapsed. */
  isPastGradingDeadline(shiftId: string, graderId: string): boolean;

  saveGrade(
    input: Omit<EssayGrade, "id" | "gradedAt" | "totalPoints"> & {
      id?: string;
      totalPoints?: number;
    },
  ): EssayGrade;
  deleteGrade(attemptId: string, questionId: string): void;
  gradesForAttempt(attemptId: string): EssayGrade[];
  essayTotalsForAttempt(attemptId: string): { points: number; max: number };

  _applyAssignments(rows: GradingAssignment[]): void;
  _applyGrades(rows: EssayGrade[]): void;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useGradingStore = create<State & Actions>()((set, get) => ({
  assignments: [],
  grades: [],
  hydrated: false,

  assignGrader(input) {
    const existing = get().assignments.find(
      (a) => a.shiftId === input.shiftId && a.graderId === input.graderId,
    );
    if (existing) return existing;
    const rec: GradingAssignment = {
      ...input,
      id: newId("ga"),
      assignedAt: new Date().toISOString(),
    };
    set({ assignments: [rec, ...get().assignments] });
    writeDoc(
      COLLECTIONS.gradingAssignments,
      rec.id,
      sanitizeForFirestore(rec as unknown as Record<string, unknown>),
    );
    return rec;
  },

  unassignGrader(id) {
    set({ assignments: get().assignments.filter((a) => a.id !== id) });
    removeDoc(COLLECTIONS.gradingAssignments, id);
  },

  gradersForShift(shiftId) {
    return get().assignments.filter((a) => a.shiftId === shiftId);
  },

  isAssigned(shiftId, graderId) {
    return get().assignments.some(
      (a) => a.shiftId === shiftId && a.graderId === graderId,
    );
  },

  deadlineForShiftGrader(shiftId, graderId) {
    const a = get().assignments.find(
      (x) => x.shiftId === shiftId && x.graderId === graderId,
    );
    return a?.deadline ?? null;
  },

  isPastGradingDeadline(shiftId, graderId) {
    const dl = get().deadlineForShiftGrader(shiftId, graderId);
    return !!dl && new Date(dl).getTime() < Date.now();
  },

  saveGrade(input) {
    // Grading-deadline guard (defence-in-depth; Firestore rules enforce
    // the same cutoff server-side). Throws so the UI can surface it.
    if (get().isPastGradingDeadline(input.shiftId, input.graderId)) {
      throw new Error("Đã quá hạn chấm — không thể lưu / sửa điểm.");
    }
    const deadline = get().deadlineForShiftGrader(
      input.shiftId,
      input.graderId,
    );
    // Denormalise the deadline (epoch ms) onto the grade doc so security
    // rules can compare with request.time without a cross-doc read.
    const gradingDeadlineMs = deadline ? new Date(deadline).getTime() : null;
    const existing = get().grades.find(
      (g) =>
        g.attemptId === input.attemptId && g.questionId === input.questionId,
    );
    const totalPoints = Object.values(input.rubricScores).reduce(
      (a, n) => a + (Number.isFinite(n) ? n : 0),
      0,
    );
    const now = new Date().toISOString();
    if (existing) {
      const next: EssayGrade = {
        ...existing,
        ...input,
        id: existing.id,
        totalPoints,
        gradedAt: now,
        gradingDeadlineMs,
      };
      set({
        grades: get().grades.map((g) => (g.id === existing.id ? next : g)),
      });
      patchDoc(
        COLLECTIONS.gradesEssay,
        next.id,
        sanitizeForFirestore(next as unknown as Record<string, unknown>),
      );
      return next;
    }
    const fresh: EssayGrade = {
      ...input,
      id: input.id ?? newId("eg"),
      totalPoints,
      gradedAt: now,
      gradingDeadlineMs,
    };
    set({ grades: [fresh, ...get().grades] });
    writeDoc(
      COLLECTIONS.gradesEssay,
      fresh.id,
      sanitizeForFirestore(fresh as unknown as Record<string, unknown>),
    );
    return fresh;
  },

  deleteGrade(attemptId, questionId) {
    const target = get().grades.find(
      (g) => g.attemptId === attemptId && g.questionId === questionId,
    );
    // Deadline guard — a past-deadline grade can no longer be removed.
    if (
      target &&
      get().isPastGradingDeadline(target.shiftId, target.graderId)
    ) {
      throw new Error("Đã quá hạn chấm — không thể xoá điểm.");
    }
    set({
      grades: get().grades.filter(
        (g) => !(g.attemptId === attemptId && g.questionId === questionId),
      ),
    });
    if (target) removeDoc(COLLECTIONS.gradesEssay, target.id);
  },

  gradesForAttempt(attemptId) {
    return get().grades.filter((g) => g.attemptId === attemptId);
  },

  essayTotalsForAttempt(attemptId) {
    const list = get().grades.filter((g) => g.attemptId === attemptId);
    let points = 0;
    let max = 0;
    for (const g of list) {
      points += g.totalPoints;
      max += g.maxPoints;
    }
    return { points, max };
  },

  _applyAssignments(rows) {
    set({ assignments: rows, hydrated: true });
  },
  _applyGrades(rows) {
    set({ grades: rows });
  },
}));

/**
 * Subscribe to grading data.
 *
 * Students pass `{ studentId }`: they read ONLY their own essay grades
 * (to see feedback/points on the result page) and skip
 * `grading_assignments` entirely (a staff-only "who grades what" table).
 * Without this scope a student could read every other student's essay
 * scores + comments — and each teacher's grade write fanned out to all
 * 1700 online students. Staff (teacher+) call with no args for the full
 * grading queue.
 */
export function subscribeGrading(opts?: { studentId?: string }): Unsubscribe {
  const isStudent = !!opts?.studentId;

  const unsubG = subscribeCollection<EssayGrade>({
    collectionName: COLLECTIONS.gradesEssay,
    constraints: opts?.studentId
      ? [where("studentId", "==", opts.studentId)]
      : [],
    fromDoc: (id, data) => ({ ...(data as EssayGrade), id }),
    onChange: (rows) => useGradingStore.getState()._applyGrades(rows),
  });

  if (isStudent) {
    // Students never see the grader-assignment table.
    useGradingStore.getState()._applyAssignments([]);
    return unsubG;
  }

  const unsubA = subscribeCollection<GradingAssignment>({
    collectionName: COLLECTIONS.gradingAssignments,
    fromDoc: (id, data) => ({ ...(data as GradingAssignment), id }),
    onChange: (rows) => useGradingStore.getState()._applyAssignments(rows),
  });
  return () => {
    unsubA();
    unsubG();
  };
}
