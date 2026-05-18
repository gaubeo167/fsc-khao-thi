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

import type { ExamShift, ShiftStatus } from "../data/types";

interface State {
  shifts: ExamShift[];
  hydrated: boolean;
}

interface Actions {
  create(input: Omit<ExamShift, "id" | "createdAt" | "updatedAt">): ExamShift;
  update(id: string, patch: Partial<ExamShift>): void;
  remove(id: string): void;
  setStatus(id: string, status: ShiftStatus): void;
  findById(id: string): ExamShift | undefined;
  _applySnapshot(rows: ExamShift[]): void;
}

function nextId(existing: ExamShift[]): string {
  const max = existing.reduce((acc, s) => {
    const m = /^SHIFT-(\d+)$/.exec(s.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `SHIFT-${String(max + 1).padStart(4, "0")}`;
}

export const useShiftsStore = create<State & Actions>()((set, get) => ({
  shifts: [],
  hydrated: false,

  create(input) {
    const id = nextId(get().shifts);
    const now = new Date().toISOString();
    const shift: ExamShift = { ...input, id, createdAt: now, updatedAt: now };
    set({ shifts: [shift, ...get().shifts] });
    writeDoc(
      COLLECTIONS.shifts,
      id,
      sanitizeForFirestore(shift as unknown as Record<string, unknown>),
    );
    return shift;
  },

  update(id, patch) {
    const now = new Date().toISOString();
    set({
      shifts: get().shifts.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now } : s,
      ),
    });
    patchDoc(
      COLLECTIONS.shifts,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  remove(id) {
    set({ shifts: get().shifts.filter((s) => s.id !== id) });
    removeDoc(COLLECTIONS.shifts, id);
  },

  setStatus(id, status) {
    get().update(id, { status });
  },

  findById(id) {
    return get().shifts.find((s) => s.id === id);
  },

  _applySnapshot(rows) {
    set({ shifts: rows, hydrated: true });
  },
}));

export function subscribeShifts(): Unsubscribe {
  return subscribeCollection<ExamShift>({
    collectionName: COLLECTIONS.shifts,
    fromDoc: (id, data) => ({ ...(data as ExamShift), id }),
    onChange: (rows) => {
      useShiftsStore.getState()._applySnapshot(rows);
    },
  });
}
