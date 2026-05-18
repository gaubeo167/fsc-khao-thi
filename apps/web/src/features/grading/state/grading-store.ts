"use client";

import type { Unsubscribe } from "firebase/firestore";
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

  saveGrade(input) {
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

export function subscribeGrading(): Unsubscribe {
  const unsubA = subscribeCollection<GradingAssignment>({
    collectionName: COLLECTIONS.gradingAssignments,
    fromDoc: (id, data) => ({ ...(data as GradingAssignment), id }),
    onChange: (rows) => useGradingStore.getState()._applyAssignments(rows),
  });
  const unsubG = subscribeCollection<EssayGrade>({
    collectionName: COLLECTIONS.gradesEssay,
    fromDoc: (id, data) => ({ ...(data as EssayGrade), id }),
    onChange: (rows) => useGradingStore.getState()._applyGrades(rows),
  });
  return () => {
    unsubA();
    unsubG();
  };
}
