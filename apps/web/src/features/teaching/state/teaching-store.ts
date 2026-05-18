"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  removeDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

/**
 * Many-to-many assignment row: a teacher teaches one subject in one class.
 * A teacher can hold multiple rows (multiple subjects across classes), and
 * a class can have multiple rows (different subjects, different teachers).
 */
export interface TeachingAssignment {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  createdAt: string;
}

interface State {
  assignments: TeachingAssignment[];
  hydrated: boolean;
}

interface Actions {
  add(
    input: Omit<TeachingAssignment, "id" | "createdAt">,
  ): TeachingAssignment | null;
  remove(id: string): void;
  removeByClass(classId: string): void;
  removeByTeacher(teacherId: string): void;
  removeBySubject(subjectId: string): void;
  forClass(classId: string): TeachingAssignment[];
  forTeacher(teacherId: string): TeachingAssignment[];

  _applySnapshot(rows: TeachingAssignment[]): void;
}

function nextId(existing: TeachingAssignment[]): string {
  const max = existing.reduce((acc, a) => {
    const m = /^TA-(\d+)$/.exec(a.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `TA-${String(max + 1).padStart(5, "0")}`;
}

export const useTeachingStore = create<State & Actions>()((set, get) => ({
  assignments: [],
  hydrated: false,

  add(input) {
    const existing = get().assignments.find(
      (a) =>
        a.classId === input.classId &&
        a.subjectId === input.subjectId &&
        a.teacherId === input.teacherId,
    );
    if (existing) return null;
    const row: TeachingAssignment = {
      ...input,
      id: nextId(get().assignments),
      createdAt: new Date().toISOString(),
    };
    set({ assignments: [row, ...get().assignments] });
    writeDoc(
      COLLECTIONS.teachingAssignments,
      row.id,
      sanitizeForFirestore(row as unknown as Record<string, unknown>),
    );
    return row;
  },

  remove(id) {
    set({ assignments: get().assignments.filter((a) => a.id !== id) });
    removeDoc(COLLECTIONS.teachingAssignments, id);
  },

  removeByClass(classId) {
    const targets = get().assignments.filter((a) => a.classId === classId);
    set({ assignments: get().assignments.filter((a) => a.classId !== classId) });
    for (const t of targets) removeDoc(COLLECTIONS.teachingAssignments, t.id);
  },

  removeByTeacher(teacherId) {
    const targets = get().assignments.filter((a) => a.teacherId === teacherId);
    set({
      assignments: get().assignments.filter((a) => a.teacherId !== teacherId),
    });
    for (const t of targets) removeDoc(COLLECTIONS.teachingAssignments, t.id);
  },

  removeBySubject(subjectId) {
    const targets = get().assignments.filter((a) => a.subjectId === subjectId);
    set({
      assignments: get().assignments.filter((a) => a.subjectId !== subjectId),
    });
    for (const t of targets) removeDoc(COLLECTIONS.teachingAssignments, t.id);
  },

  forClass(classId) {
    return get().assignments.filter((a) => a.classId === classId);
  },

  forTeacher(teacherId) {
    return get().assignments.filter((a) => a.teacherId === teacherId);
  },

  _applySnapshot(rows) {
    set({ assignments: rows, hydrated: true });
  },
}));

export function subscribeTeaching(): Unsubscribe {
  return subscribeCollection<TeachingAssignment>({
    collectionName: COLLECTIONS.teachingAssignments,
    fromDoc: (id, data) => ({ ...(data as TeachingAssignment), id }),
    onChange: (rows) => {
      useTeachingStore.getState()._applySnapshot(rows);
    },
  });
}
