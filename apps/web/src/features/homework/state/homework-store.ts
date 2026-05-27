"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { recordAudit } from "@/lib/audit/record";
import { isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import type { Homework, HomeworkStatus } from "../data/types";
import { useHomeworkAttemptsStore } from "./homework-attempts-store";

interface State {
  homework: Homework[];
  hydrated: boolean;
}

interface Actions {
  create(input: Omit<Homework, "id" | "createdAt" | "updatedAt">): Homework;
  update(id: string, patch: Partial<Homework>): void;
  setStatus(id: string, status: HomeworkStatus): void;
  archive(id: string, actorUid: string, reason?: string): void;
  restore(id: string, actorUid: string): void;
  findById(id: string): Homework | undefined;
  _applySnapshot(rows: Homework[]): void;
}

function nextId(existing: Homework[]): string {
  const max = existing.reduce((acc, h) => {
    const m = /^HW-(\d+)$/.exec(h.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `HW-${String(max + 1).padStart(4, "0")}`;
}

function pickAuditFields(h: Homework | undefined) {
  if (!h) return null;
  return {
    title: h.title,
    subjectId: h.subjectId,
    gradeId: h.gradeId,
    classCount: h.classIds.length,
    questionCount: h.questionIds.length,
    materialCount: h.materialIds.length,
    assignedAt: h.assignedAt,
    dueAt: h.dueAt,
    status: h.status,
  };
}

export const useHomeworkStore = create<State & Actions>()((set, get) => ({
  homework: [],
  hydrated: false,

  create(input) {
    const id = nextId(get().homework);
    const now = new Date().toISOString();
    const hw: Homework = { ...input, id, createdAt: now, updatedAt: now };
    set({ homework: [hw, ...get().homework] });
    writeDoc(
      COLLECTIONS.homework,
      id,
      sanitizeForFirestore(hw as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "create",
      after: pickAuditFields(hw),
      campusId: hw.campusId,
      reason: "Homework created",
    });
    return hw;
  },

  update(id, patch) {
    const before = get().homework.find((h) => h.id === id);
    const now = new Date().toISOString();
    set({
      homework: get().homework.map((h) =>
        h.id === id ? { ...h, ...patch, updatedAt: now } : h,
      ),
    });
    patchDoc(
      COLLECTIONS.homework,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "update",
      before: pickAuditFields(before),
      after: pickAuditFields(
        before ? ({ ...before, ...patch } as Homework) : undefined,
      ),
      campusId: before?.campusId ?? null,
    });
  },

  setStatus(id, status) {
    get().update(id, { status });
  },

  archive(id, actorUid, reason) {
    const before = get().homework.find((h) => h.id === id);
    if (!before) return;
    // Data-integrity guard: BTVN that has ANY student attempt cannot
    // be archived (let alone hard-deleted). The list page surfaces a
    // CTA explaining this; this is defense-in-depth for any other
    // caller that bypasses the UI guard.
    // ESM import at module top is safe — stores don't read each
    // other at module init, only inside actions like this one which
    // run later. Cross-store .getState() is the standard Zustand
    // pattern for derived guards.
    const attempts =
      useHomeworkAttemptsStore.getState().attempts;
    const hasData = attempts.some((a) => a.homeworkId === id);
    if (hasData) {
      // eslint-disable-next-line no-console
      console.warn(
        `[homework-store] archive blocked for ${id}: has ${attempts.filter((a) => a.homeworkId === id).length} attempts`,
      );
      return;
    }
    const now = new Date().toISOString();
    const patch: Partial<Homework> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    };
    set({
      homework: get().homework.map((h) =>
        h.id === id ? { ...h, ...patch, updatedAt: now } : h,
      ),
    });
    patchDoc(
      COLLECTIONS.homework,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "archive",
      before: pickAuditFields(before),
      after: pickAuditFields({ ...before, ...patch } as Homework),
      campusId: before.campusId,
      reason,
    });
  },

  restore(id, actorUid) {
    const before = get().homework.find((h) => h.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<Homework> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    set({
      homework: get().homework.map((h) =>
        h.id === id ? { ...h, ...patch, updatedAt: now } : h,
      ),
    });
    patchDoc(
      COLLECTIONS.homework,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "restore",
      before: pickAuditFields(before),
      after: pickAuditFields({ ...before, ...patch } as Homework),
      campusId: before.campusId,
    });
  },

  findById(id) {
    return get().homework.find((h) => h.id === id);
  },

  _applySnapshot(rows) {
    set({ homework: rows, hydrated: true });
  },
}));

export function subscribeHomework(): Unsubscribe {
  if (!isFirebaseConfigured()) {
    useHomeworkStore.getState()._applySnapshot([]);
    return () => {
      /* no-op */
    };
  }
  return subscribeCollection<Homework>({
    collectionName: COLLECTIONS.homework,
    fromDoc: (id, data) => ({ ...(data as Homework), id }),
    onChange: (rows) => useHomeworkStore.getState()._applySnapshot(rows),
  });
}
