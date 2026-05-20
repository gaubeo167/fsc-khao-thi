"use client";

/**
 * /exam_forms mirror — frozen exam content per shift. One form per
 * active shift; legacy forms move to `lifecycle: "archived"` when a
 * shift is republished (Phase D version chains).
 *
 * The store is consumed by:
 *   - exam page (student-facing): reads form + picks variant for the
 *     signed-in student.
 *   - grading / reports: reads question snapshots so the displayed
 *     question text matches what the student actually saw, even after
 *     the question bank evolves.
 *
 * Writes happen in two places:
 *   1. shift wizard `create()` / `update()` → calls
 *      `useExamFormsStore.getState().materializeForShift(...)` which
 *      builds the snapshot and persists it.
 *   2. shift archive → soft-archives the form too.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { create } from "zustand";

import { recordAudit } from "@/lib/audit/record";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { sanitizeForFirestore } from "@/lib/firestore-sync";

import type { ExamForm } from "../data/types";

interface State {
  forms: ExamForm[];
  hydrated: boolean;
}

interface Actions {
  /** Persist a freshly materialized form. */
  saveForm(form: ExamForm): Promise<void>;
  /** Soft-archive every active form belonging to a shift. */
  archiveForShift(shiftId: string, reason?: string): Promise<void>;
  /** Active form for a shift. If none exists (legacy shift created
   *  before snapshots), returns null — the caller must rematerialize. */
  activeForShift(shiftId: string): ExamForm | null;
  _applySnapshot(rows: ExamForm[]): void;
}

export const useExamFormsStore = create<State & Actions>()((set, get) => ({
  forms: [],
  hydrated: false,

  async saveForm(form) {
    // Optimistic local update first.
    set({
      forms: [form, ...get().forms.filter((f) => f.id !== form.id)],
    });
    if (!isFirebaseConfigured()) return;
    await setDoc(
      doc(getDb(), COLLECTIONS.examForms, form.id),
      sanitizeForFirestore({
        ...form,
        _serverUpdatedAt: serverTimestamp(),
      }),
    );
    recordAudit({
      entityType: "exam_form",
      entityId: form.id,
      action: "snapshot",
      after: {
        shiftId: form.shiftId,
        packageId: form.packageId,
        blueprintId: form.blueprintId,
        variantCount: form.variants.length,
        questionCount: form.variants[0]?.questions.length ?? 0,
        integrityHash: form.integrityHash,
      },
      campusId: form.campusId,
    });
  },

  async archiveForShift(shiftId, reason) {
    const matches = get().forms.filter(
      (f) => f.shiftId === shiftId && f.lifecycle === "active",
    );
    if (matches.length === 0) return;
    set({
      forms: get().forms.map((f) =>
        f.shiftId === shiftId && f.lifecycle === "active"
          ? { ...f, lifecycle: "archived" as const }
          : f,
      ),
    });
    if (!isFirebaseConfigured()) return;
    await Promise.all(
      matches.map((f) =>
        updateDoc(doc(getDb(), COLLECTIONS.examForms, f.id), {
          lifecycle: "archived",
          updatedAt: new Date().toISOString(),
          _serverUpdatedAt: serverTimestamp(),
        }).then(() =>
          recordAudit({
            entityType: "exam_form",
            entityId: f.id,
            action: "archive",
            before: { lifecycle: "active" },
            after: { lifecycle: "archived" },
            campusId: f.campusId,
            reason,
          }),
        ),
      ),
    );
  },

  activeForShift(shiftId) {
    return (
      get().forms.find(
        (f) => f.shiftId === shiftId && f.lifecycle === "active",
      ) ?? null
    );
  },

  _applySnapshot(rows) {
    set({ forms: rows, hydrated: true });
  },
}));

export function subscribeExamForms(): Unsubscribe {
  if (!isFirebaseConfigured()) {
    useExamFormsStore.getState()._applySnapshot([]);
    return () => {
      /* no-op */
    };
  }
  const q = query(collection(getDb(), COLLECTIONS.examForms));
  return onSnapshot(
    q,
    (snap) => {
      const rows: ExamForm[] = snap.docs.map((d) => {
        const data = d.data() as Partial<ExamForm>;
        return { ...(data as ExamForm), id: d.id };
      });
      useExamFormsStore.getState()._applySnapshot(rows);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn("[exam-forms] subscribe error", err);
    },
  );
}

// Re-exported so callers don't have to know firebase/firestore by name.
export const _internal = { deleteDoc };
