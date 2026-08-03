"use client";

/**
 * /generated_exams mirror — the "đề" a teacher pre-generates from a package
 * (Đề 001, 002 …) BEFORE creating a shift. The shift wizard gates package
 * selection on "đã sinh đề" using this store.
 *
 * ⚠️ This used to be a localStorage-only (persist) store, which meant
 * "đã sinh đề" was known only on the exact browser/origin that generated
 * them. On production (a different origin than dev, or a different admin's
 * machine) every package showed "Chưa sinh đề" and couldn't be picked.
 * It's now Firestore-backed + subscribed (staff-only) so readiness is
 * consistent across devices.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { create } from "zustand";

import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { sanitizeForFirestore } from "@/lib/firestore-sync";

import { SEED_GENERATED } from "../data/seeds";
import type { GeneratedExam } from "../data/types";

interface State {
  generated: GeneratedExam[];
  hydrated: boolean;
}

interface Actions {
  /** Append a batch of newly-generated exams (returns the new exams). */
  addBatch(
    input: Omit<GeneratedExam, "id" | "createdAt" | "name">[],
    nameTemplate?: (index: number) => string,
  ): GeneratedExam[];
  remove(id: string): void;
  removeByPackage(packageId: string): void;
  findById(id: string): GeneratedExam | undefined;
  _applySnapshot(rows: GeneratedExam[]): void;
}

function nextId(existing: GeneratedExam[]): string {
  const max = existing.reduce((acc, e) => {
    const m = /^EX-(\d+)$/.exec(e.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `EX-${String(max + 1).padStart(5, "0")}`;
}

export const useGeneratedStore = create<State & Actions>()((set, get) => ({
  generated: [],
  hydrated: false,

  addBatch(input, nameTemplate) {
    const now = new Date().toISOString();
    const existing = [...get().generated];
    const created: GeneratedExam[] = [];
    for (let i = 0; i < input.length; i++) {
      const id = nextId(existing);
      const name =
        nameTemplate?.(i + 1) ?? `Đề ${String(i + 1).padStart(3, "0")}`;
      const exam: GeneratedExam = {
        ...input[i]!,
        id,
        name,
        createdAt: now,
      };
      existing.unshift(exam);
      created.push(exam);
    }
    // Optimistic local update first.
    set({ generated: existing });
    // Persist to Firestore so other devices/admins see them too.
    if (isFirebaseConfigured()) {
      for (const exam of created) {
        void setDoc(
          doc(getDb(), COLLECTIONS.generated, exam.id),
          sanitizeForFirestore(exam as unknown as Record<string, unknown>),
        );
      }
    }
    return created;
  },

  remove(id) {
    set({ generated: get().generated.filter((e) => e.id !== id) });
    if (isFirebaseConfigured()) {
      void deleteDoc(doc(getDb(), COLLECTIONS.generated, id));
    }
  },

  removeByPackage(packageId) {
    const doomed = get().generated.filter((e) => e.packageId === packageId);
    set({
      generated: get().generated.filter((e) => e.packageId !== packageId),
    });
    if (isFirebaseConfigured()) {
      for (const e of doomed) {
        void deleteDoc(doc(getDb(), COLLECTIONS.generated, e.id));
      }
    }
  },

  findById(id) {
    return get().generated.find((e) => e.id === id);
  },

  _applySnapshot(rows) {
    set({ generated: rows, hydrated: true });
  },
}));

/**
 * Subscribe to /generated_exams. Staff-only (students never read it — the
 * runtime uses frozen exam_forms). In demo mode (no Firebase) we seed the
 * store so the local walkthrough still shows đề.
 */
export function subscribeGenerated(): Unsubscribe {
  if (!isFirebaseConfigured()) {
    useGeneratedStore.getState()._applySnapshot(SEED_GENERATED);
    return () => {
      /* no-op */
    };
  }
  const q = query(collection(getDb(), COLLECTIONS.generated));
  return onSnapshot(
    q,
    (snap) => {
      const rows: GeneratedExam[] = snap.docs.map((d) => ({
        ...(d.data() as GeneratedExam),
        id: d.id,
      }));
      useGeneratedStore.getState()._applySnapshot(rows);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn("[generated] subscribe error", err);
    },
  );
}
