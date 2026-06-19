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
import { deleteStoredFile } from "@/lib/storage";
import { nextVersionFields, rootId, versionOf } from "@/lib/version";

import { SEED_MATERIALS } from "../data/seed-materials";
import type {
  LearningMaterial,
  MaterialStatus,
} from "../data/types";

// Demo-only seed; empty in production.
const INITIAL_MATERIALS = isFirebaseConfigured() ? [] : SEED_MATERIALS;

interface State {
  materials: LearningMaterial[];
  hydrated: boolean;
}

interface Actions {
  create(
    input: Omit<LearningMaterial, "id" | "createdAt" | "updatedAt">,
  ): LearningMaterial;
  update(id: string, patch: Partial<LearningMaterial>): void;
  setStatus(
    id: string,
    status: MaterialStatus,
    approverId?: string,
    note?: string,
  ): void;
  /** Soft-archive — also schedules the underlying Storage object for
   *  best-effort deletion (kept idempotent so a re-archive is safe). */
  archive(id: string, actorUid: string, reason?: string): Promise<void>;
  restore(id: string, actorUid: string): void;
  /** Phase D — clone as new version. New doc starts in draft + same
   *  Storage path is reused (admin can edit metadata; if they want to
   *  swap the file, that's a separate Upload action that PATCHES the
   *  clone's storagePath). */
  cloneAsNewVersion(
    sourceId: string,
    actorUid: string,
    reason?: string,
  ): LearningMaterial | null;
  findById(id: string): LearningMaterial | undefined;
  _applySnapshot(rows: LearningMaterial[]): void;
}

function nextId(existing: LearningMaterial[]): string {
  const max = existing.reduce((acc, m) => {
    const match = /^MAT-(\d+)$/.exec(m.id);
    return match ? Math.max(acc, Number.parseInt(match[1]!, 10)) : acc;
  }, 0);
  return `MAT-${String(max + 1).padStart(5, "0")}`;
}

/** Tiny projection used for audit before/after rows. Excludes the
 *  downloadUrl (long-lived token) and contentType (noise). */
function pickAuditFields(m: LearningMaterial | undefined) {
  if (!m) return null;
  return {
    title: m.title,
    fileType: m.fileType,
    sizeBytes: m.sizeBytes,
    subjectId: m.subjectId,
    gradeId: m.gradeId,
    kho: m.kho,
    status: m.status,
    storagePath: m.storagePath,
    originalFilename: m.originalFilename,
  };
}

export const useMaterialsStore = create<State & Actions>()((set, get) => ({
  materials: INITIAL_MATERIALS,
  hydrated: false,

  create(input) {
    const id = nextId(get().materials);
    const now = new Date().toISOString();
    const material: LearningMaterial = {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
    };
    set({ materials: [material, ...get().materials] });
    writeDoc(
      COLLECTIONS.learningMaterials,
      id,
      sanitizeForFirestore(material as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      // Material reuses entity type "question" until audit_types gets a
      // dedicated "material" entry. The entityId still scopes uniquely.
      entityId: id,
      action: "create",
      after: pickAuditFields(material),
      campusId: material.campusId,
    });
    return material;
  },

  update(id, patch) {
    const before = get().materials.find((m) => m.id === id);
    const now = new Date().toISOString();
    set({
      materials: get().materials.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: now } : m,
      ),
    });
    patchDoc(
      COLLECTIONS.learningMaterials,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "update",
      before: pickAuditFields(before),
      after: pickAuditFields(
        before ? ({ ...before, ...patch } as LearningMaterial) : undefined,
      ),
      campusId: before?.campusId ?? null,
    });
  },

  setStatus(id, status, approverId, note) {
    const before = get().materials.find((m) => m.id === id);
    const patch: Partial<LearningMaterial> = {
      status,
      approvedBy: status === "approved" ? approverId ?? null : null,
      rejectionNote: status === "rejected" ? note ?? null : null,
    };
    get().update(id, patch);
    if (status === "approved" || status === "rejected") {
      recordAudit({
        entityType: "question",
        entityId: id,
        action: status === "approved" ? "approve" : "reject",
        before: pickAuditFields(before),
        after: pickAuditFields(
          before ? ({ ...before, ...patch } as LearningMaterial) : undefined,
        ),
        campusId: before?.campusId ?? null,
        reason: note,
      });
    }
  },

  async archive(id, actorUid, reason) {
    const before = get().materials.find((m) => m.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<LearningMaterial> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    };
    set({
      materials: get().materials.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: now } : m,
      ),
    });
    patchDoc(
      COLLECTIONS.learningMaterials,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "archive",
      before: pickAuditFields(before),
      after: pickAuditFields({ ...before, ...patch } as LearningMaterial),
      campusId: before.campusId,
      reason,
    });
    // Best-effort delete of underlying bytes — only for upload sources
    // (link materials have no bytes to delete; storagePath is empty).
    if (before.sourceType === "upload" && before.storagePath) {
      void deleteStoredFile(before.storagePath);
    }
  },

  restore(id, actorUid) {
    const before = get().materials.find((m) => m.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<LearningMaterial> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    set({
      materials: get().materials.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: now } : m,
      ),
    });
    patchDoc(
      COLLECTIONS.learningMaterials,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "restore",
      before: pickAuditFields(before),
      after: pickAuditFields({ ...before, ...patch } as LearningMaterial),
      campusId: before.campusId,
    });
  },

  cloneAsNewVersion(sourceId, actorUid, reason) {
    const source = get().materials.find((m) => m.id === sourceId);
    if (!source) return null;
    const id = nextId(get().materials);
    const now = new Date().toISOString();
    const { version, versionOfRootId } = nextVersionFields(source);
    const clone: LearningMaterial = {
      ...JSON.parse(JSON.stringify(source)),
      id,
      version,
      versionOfRootId,
      status: "draft",
      approvedBy: null,
      rejectionNote: null,
      ownerId: actorUid,
      ownerName: source.ownerName,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      createdAt: now,
      updatedAt: now,
    };
    set({ materials: [clone, ...get().materials] });
    writeDoc(
      COLLECTIONS.learningMaterials,
      id,
      sanitizeForFirestore(clone as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "lifecycle-transition",
      before: { sourceId, sourceVersion: versionOf(source) },
      after: {
        newVersion: version,
        rootId: rootId(source),
        status: "draft",
      },
      campusId: source.campusId,
      reason: reason ?? "Tạo phiên bản mới của học liệu",
    });
    return clone;
  },

  findById(id) {
    return get().materials.find((m) => m.id === id);
  },

  _applySnapshot(rows) {
    set({ materials: rows, hydrated: true });
  },
}));

export function subscribeMaterials(): Unsubscribe {
  if (!isFirebaseConfigured()) {
    useMaterialsStore.getState()._applySnapshot([]);
    return () => {
      /* no-op */
    };
  }
  return subscribeCollection<LearningMaterial>({
    collectionName: COLLECTIONS.learningMaterials,
    fromDoc: (id, data) => ({ ...(data as LearningMaterial), id }),
    onChange: (rows) => useMaterialsStore.getState()._applySnapshot(rows),
  });
}
