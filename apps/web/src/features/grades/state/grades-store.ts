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

import {
  SEED_CLASSES,
  SEED_GRADES,
  type Grade,
  type SchoolClass,
} from "../data/seed-grades";

interface State {
  grades: Grade[];
  classes: SchoolClass[];
  hydrated: boolean;
}

interface Actions {
  createGrade(
    input: Omit<Grade, "id" | "createdAt" | "classCount" | "studentCount">,
  ): Grade;
  updateGrade(id: string, patch: Partial<Grade>): void;
  removeGrade(id: string): void;

  createClass(input: Omit<SchoolClass, "id" | "createdAt">): SchoolClass;
  updateClass(id: string, patch: Partial<SchoolClass>): void;
  removeClass(id: string): void;

  classesOfGrade(gradeId: string): SchoolClass[];
  studentTotal(): number;

  _applyGrades(rows: Grade[]): void;
  _applyClasses(rows: SchoolClass[]): void;
}

function nextId(existing: { id: string }[], prefix: string): string {
  const max = existing.reduce((acc, x) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

function extractNumber(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? Number.parseInt(m[1]!, 10) : Number.MAX_SAFE_INTEGER;
}

function sortGrades(grades: Grade[]): Grade[] {
  return [...grades].sort((a, b) => {
    const numA = extractNumber(a.name);
    const numB = extractNumber(b.name);
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, "vi");
  });
}

function sortClasses(classes: SchoolClass[]): SchoolClass[] {
  return [...classes].sort((a, b) =>
    a.code.localeCompare(b.code, "vi", { numeric: true }),
  );
}

export const useGradesStore = create<State & Actions>()((set, get) => ({
  grades: sortGrades(SEED_GRADES),
  classes: sortClasses(SEED_CLASSES),
  hydrated: false,

  createGrade(input) {
    const id = nextId(get().grades, "grade-");
    const g: Grade = {
      ...input,
      id,
      classCount: 0,
      studentCount: 0,
      createdAt: new Date().toISOString(),
    };
    set({ grades: sortGrades([...get().grades, g]) });
    writeDoc(
      COLLECTIONS.grades,
      id,
      sanitizeForFirestore(g as unknown as Record<string, unknown>),
    );
    return g;
  },

  updateGrade(id, patch) {
    set({
      grades: sortGrades(
        get().grades.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      ),
    });
    patchDoc(
      COLLECTIONS.grades,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  removeGrade(id) {
    const orphans = get().classes.filter((c) => c.gradeId === id);
    set({
      grades: get().grades.filter((g) => g.id !== id),
      classes: get().classes.filter((c) => c.gradeId !== id),
    });
    removeDoc(COLLECTIONS.grades, id);
    for (const c of orphans) removeDoc(COLLECTIONS.classes, c.id);
  },

  createClass(input) {
    const id = nextId(get().classes, "class-");
    const c: SchoolClass = {
      ...input,
      id,
      createdAt: new Date().toISOString(),
    };
    set({ classes: sortClasses([...get().classes, c]) });
    writeDoc(
      COLLECTIONS.classes,
      id,
      sanitizeForFirestore(c as unknown as Record<string, unknown>),
    );
    return c;
  },

  updateClass(id, patch) {
    set({
      classes: sortClasses(
        get().classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      ),
    });
    patchDoc(
      COLLECTIONS.classes,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  removeClass(id) {
    set({ classes: get().classes.filter((c) => c.id !== id) });
    removeDoc(COLLECTIONS.classes, id);
  },

  classesOfGrade(gradeId) {
    return get().classes.filter((c) => c.gradeId === gradeId);
  },

  studentTotal() {
    return get().classes.reduce((acc, c) => acc + c.studentCount, 0);
  },

  _applyGrades(rows) {
    set({ grades: sortGrades(rows), hydrated: true });
  },
  _applyClasses(rows) {
    set({ classes: sortClasses(rows) });
  },
}));

export function subscribeGradesCatalog(): Unsubscribe {
  const unsubG = subscribeCollection<Grade>({
    collectionName: COLLECTIONS.grades,
    fromDoc: (id, data) => ({ ...(data as Grade), id }),
    onChange: (rows) => {
      if (rows.length === 0 && !useGradesStore.getState().hydrated) {
        useGradesStore.setState({ hydrated: true });
        return;
      }
      useGradesStore.getState()._applyGrades(rows);
    },
  });
  const unsubC = subscribeCollection<SchoolClass>({
    collectionName: COLLECTIONS.classes,
    fromDoc: (id, data) => ({ ...(data as SchoolClass), id }),
    onChange: (rows) => {
      if (rows.length === 0) return; // keep seed
      useGradesStore.getState()._applyClasses(rows);
    },
  });
  return () => {
    unsubG();
    unsubC();
  };
}
