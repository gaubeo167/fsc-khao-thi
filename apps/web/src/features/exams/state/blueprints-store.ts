"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { recordAudit } from "@/lib/audit/record";
import { isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { nextVersionFields, rootId, versionOf } from "@/lib/version";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import { SEED_BLUEPRINTS } from "../data/seeds";
import type { ExamBlueprint } from "../data/types";

interface State {
  blueprints: ExamBlueprint[];
  hydrated: boolean;
}

interface Actions {
  create(
    input: Omit<ExamBlueprint, "id" | "createdAt" | "updatedAt">,
  ): ExamBlueprint;
  update(id: string, patch: Partial<ExamBlueprint>): void;
  /** Soft-delete (sets archivedAt). Hard delete is forbidden — packages
   *  + exam_forms + audit permanently reference blueprints. */
  archive(id: string, actorUid: string, reason?: string): void;
  /** Inverse — clear archive fields. */
  restore(id: string, actorUid: string): void;
  /** Legacy alias — routes to archive(). */
  remove(id: string): void;
  /** Clone as new version (Phase D version-chains). The new doc shares
   *  the parent's `versionOfRootId`, gets `version = parent.version + 1`,
   *  and the parent stays live until explicitly archived. */
  cloneAsNewVersion(
    sourceId: string,
    actorUid: string,
    reason?: string,
  ): ExamBlueprint | null;
  findById(id: string): ExamBlueprint | undefined;
  _applySnapshot(rows: ExamBlueprint[]): void;
}

function pickBlueprintAuditFields(b: ExamBlueprint | undefined) {
  if (!b) return null;
  return {
    name: b.name,
    subjectId: b.subjectId,
    gradeId: b.gradeId,
    duration: b.duration,
    topicCount: b.topics?.length ?? 0,
    totalPickedQuestions: b.topics?.reduce(
      (n, t) => n + (t.pickedQuestionIds?.length ?? 0),
      0,
    ),
  };
}

function nextId(existing: ExamBlueprint[]): string {
  const max = existing.reduce((acc, b) => {
    const m = /^BP-(\d+)$/.exec(b.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `BP-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Trim whitespace and trailing dashes from a reference id so a value like
 * `"grade-5- "` matches `"grade-5"`. We saw real data with trailing dashes
 * in the wild that completely broke the shift-wizard filter — kept here
 * as defense even after the migration.
 */
function cleanRefId(value: string | null | undefined): string | null {
  if (value == null) return value ?? null;
  if (typeof value !== "string") return value as never;
  return value.trim().replace(/[-\s]+$/g, "");
}

function sanitizeBlueprint<T extends Partial<ExamBlueprint>>(input: T): T {
  return {
    ...input,
    ...(input.subjectId !== undefined && {
      subjectId: cleanRefId(input.subjectId) as string,
    }),
    ...(input.gradeId !== undefined && {
      gradeId: cleanRefId(input.gradeId) as string,
    }),
    ...(input.campusId !== undefined && {
      campusId: cleanRefId(input.campusId),
    }),
  };
}

const INITIAL_BLUEPRINTS = isFirebaseConfigured() ? [] : SEED_BLUEPRINTS;

export const useBlueprintsStore = create<State & Actions>()((set, get) => ({
  blueprints: INITIAL_BLUEPRINTS,
  hydrated: false,

  create(input) {
    const id = nextId(get().blueprints);
    const now = new Date().toISOString();
    const sanitized = sanitizeBlueprint(input);
    const blueprint: ExamBlueprint = {
      ...sanitized,
      id,
      createdAt: now,
      updatedAt: now,
    } as ExamBlueprint;
    set({ blueprints: [blueprint, ...get().blueprints] });
    writeDoc(
      COLLECTIONS.blueprints,
      id,
      sanitizeForFirestore(blueprint as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "blueprint",
      entityId: id,
      action: "create",
      after: pickBlueprintAuditFields(blueprint),
      campusId: blueprint.campusId,
    });
    return blueprint;
  },

  update(id, patch) {
    const before = get().blueprints.find((b) => b.id === id);
    const sanitized = sanitizeBlueprint(patch);
    const now = new Date().toISOString();
    set({
      blueprints: get().blueprints.map((b) =>
        b.id === id ? { ...b, ...sanitized, updatedAt: now } : b,
      ),
    });
    patchDoc(
      COLLECTIONS.blueprints,
      id,
      sanitizeForFirestore(sanitized as Record<string, unknown>),
    );
    recordAudit({
      entityType: "blueprint",
      entityId: id,
      action: "update",
      before: pickBlueprintAuditFields(before),
      after: pickBlueprintAuditFields(
        before ? ({ ...before, ...sanitized } as ExamBlueprint) : undefined,
      ),
      campusId: before?.campusId ?? null,
    });
  },

  archive(id, actorUid, reason) {
    const before = get().blueprints.find((b) => b.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamBlueprint> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    };
    set({
      blueprints: get().blueprints.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: now } : b,
      ),
    });
    patchDoc(
      COLLECTIONS.blueprints,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "blueprint",
      entityId: id,
      action: "archive",
      before: pickBlueprintAuditFields(before),
      after: pickBlueprintAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
      reason,
    });
  },

  restore(id, actorUid) {
    const before = get().blueprints.find((b) => b.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamBlueprint> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    set({
      blueprints: get().blueprints.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: now } : b,
      ),
    });
    patchDoc(
      COLLECTIONS.blueprints,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "blueprint",
      entityId: id,
      action: "restore",
      before: pickBlueprintAuditFields(before),
      after: pickBlueprintAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
    });
  },

  remove(id) {
    get().archive(id, "system", "Legacy remove() call");
  },

  cloneAsNewVersion(sourceId, actorUid, reason) {
    const source = get().blueprints.find((b) => b.id === sourceId);
    if (!source) return null;
    const id = nextId(get().blueprints);
    const now = new Date().toISOString();
    const { version, versionOfRootId } = nextVersionFields(source);
    const baseCopy = JSON.parse(JSON.stringify(source)) as ExamBlueprint;
    const clone: ExamBlueprint = {
      ...baseCopy,
      id,
      version,
      versionOfRootId,
      ownerId: actorUid,
      ownerName: source.ownerName,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      createdAt: now,
      updatedAt: now,
    };
    set({ blueprints: [clone, ...get().blueprints] });
    writeDoc(
      COLLECTIONS.blueprints,
      id,
      sanitizeForFirestore(clone as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "blueprint",
      entityId: id,
      action: "lifecycle-transition",
      before: { sourceId, sourceVersion: versionOf(source) },
      after: {
        newVersion: version,
        rootId: rootId(source),
      },
      campusId: source.campusId,
      reason: reason ?? "Tạo phiên bản mới từ khung đề",
    });
    return clone;
  },

  findById(id) {
    return get().blueprints.find((b) => b.id === id);
  },

  _applySnapshot(rows) {
    set({
      blueprints: rows.map((b) => sanitizeBlueprint(b) as ExamBlueprint),
      hydrated: true,
    });
  },
}));

export function subscribeBlueprints(): Unsubscribe {
  return subscribeCollection<ExamBlueprint>({
    collectionName: COLLECTIONS.blueprints,
    fromDoc: (id, data) => ({ ...(data as ExamBlueprint), id }),
    onChange: (rows) => {
      if (rows.length === 0 && !useBlueprintsStore.getState().hydrated) {
        useBlueprintsStore.setState({ hydrated: true });
        return;
      }
      useBlueprintsStore.getState()._applySnapshot(rows);
    },
  });
}
