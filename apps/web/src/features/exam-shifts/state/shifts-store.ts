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

import { SEED_SHIFTS } from "../data/seed-shifts";
import type { ExamShift, ShiftStatus } from "../data/types";

// Demo-only seed; empty when Firebase is configured (production).
const INITIAL_SHIFTS = isFirebaseConfigured() ? [] : SEED_SHIFTS;

interface State {
  shifts: ExamShift[];
  hydrated: boolean;
}

interface Actions {
  create(input: Omit<ExamShift, "id" | "createdAt" | "updatedAt">): ExamShift;
  update(id: string, patch: Partial<ExamShift>): void;
  /**
   * Soft-delete. Sets archivedAt + archivedBy + archiveReason.
   * Hard delete is forbidden — attempts/audit/exam_forms permanently
   * reference shifts. The legacy `remove()` alias still exists for
   * older callers and now also routes through here.
   */
  archive(id: string, actorUid: string, reason?: string): void;
  /** Inverse — clear archive fields so the shift reappears in lists. */
  restore(id: string, actorUid: string): void;
  /** Legacy alias preserved while callers migrate. Routes to archive(). */
  remove(id: string): void;
  setStatus(id: string, status: ShiftStatus): void;
  findById(id: string): ExamShift | undefined;
  _applySnapshot(rows: ExamShift[]): void;
}

/** Reduce a shift to the fields most useful in an audit row — drops
 *  large arrays (rooms with hundreds of students) and meta noise so the
 *  audit log stays scannable. The before/after diff is computed against
 *  these projections. */
function pickShiftAuditFields(s: ExamShift | undefined) {
  if (!s) return null;
  return {
    name: s.name,
    status: s.status,
    startAt: s.startAt,
    endAt: s.endAt,
    packageId: s.packageId,
    gradeId: s.gradeId,
    subjectId: s.subjectId,
    classIds: s.classIds,
    roomCount: s.rooms?.length ?? 0,
    studentCount: s.rooms?.reduce(
      (n, r) => n + (r.studentIds?.length ?? 0),
      0,
    ),
    scoringMaxScore: s.scoring?.maxScore,
    scoringMode: s.scoring?.mode,
  };
}

function nextId(existing: ExamShift[]): string {
  const max = existing.reduce((acc, s) => {
    const m = /^SHIFT-(\d+)$/.exec(s.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `SHIFT-${String(max + 1).padStart(4, "0")}`;
}

export const useShiftsStore = create<State & Actions>()((set, get) => ({
  shifts: INITIAL_SHIFTS,
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
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "create",
      after: {
        name: shift.name,
        gradeId: shift.gradeId,
        subjectId: shift.subjectId,
        packageId: shift.packageId,
        startAt: shift.startAt,
        endAt: shift.endAt,
        status: shift.status,
      },
      campusId: shift.campusId,
    });
    return shift;
  },

  update(id, patch) {
    const before = get().shifts.find((s) => s.id === id);
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
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "update",
      before: pickShiftAuditFields(before),
      after: pickShiftAuditFields({ ...(before ?? ({} as ExamShift)), ...patch }),
      campusId: before?.campusId ?? null,
    });
  },

  archive(id, actorUid, reason) {
    const before = get().shifts.find((s) => s.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamShift> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    };
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
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "archive",
      before: pickShiftAuditFields(before),
      after: pickShiftAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
      reason,
    });
  },

  restore(id, actorUid) {
    const before = get().shifts.find((s) => s.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamShift> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
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
    recordAudit({
      entityType: "shift",
      entityId: id,
      action: "restore",
      before: pickShiftAuditFields(before),
      after: pickShiftAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
    });
  },

  remove(id) {
    // Legacy alias — routes to archive(). We pull the current actor
    // from the auth session synchronously; callers that need to
    // override should call archive(id, actor, reason) directly.
    const actorUid = "system";
    get().archive(id, actorUid, "Legacy remove() call");
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
