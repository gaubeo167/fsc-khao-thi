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

import { SEED_PACKAGES } from "../data/seeds";
import type { ExamPackage, PackageStatus } from "../data/types";

interface State {
  packages: ExamPackage[];
  hydrated: boolean;
}

interface Actions {
  create(input: Omit<ExamPackage, "id" | "createdAt" | "updatedAt">): ExamPackage;
  update(id: string, patch: Partial<ExamPackage>): void;
  /** Soft-delete (sets archivedAt). Hard delete is forbidden — shifts
   *  + audit + analytics permanently reference packages. */
  archive(id: string, actorUid: string, reason?: string): void;
  /** Inverse — clear archive fields. */
  restore(id: string, actorUid: string): void;
  /** Legacy alias — routes to archive(). */
  remove(id: string): void;
  /** Clone as new version (Phase D). New doc starts in `status: "draft"`
   *  so it re-enters the approval flow — clones inherit content but
   *  not approval state. */
  cloneAsNewVersion(
    sourceId: string,
    actorUid: string,
    reason?: string,
  ): ExamPackage | null;
  setStatus(
    id: string,
    status: PackageStatus,
    approverId?: string,
    note?: string,
  ): void;
  findById(id: string): ExamPackage | undefined;
  _applySnapshot(rows: ExamPackage[]): void;
}

function pickPackageAuditFields(p: ExamPackage | undefined) {
  if (!p) return null;
  return {
    name: p.name,
    blueprintId: p.blueprintId,
    duration: p.duration,
    matrixRowCount: p.matrix?.length ?? 0,
    matrixTotal: p.matrix?.reduce(
      (n, r) => n + r.easyCount + r.mediumCount + r.hardCount,
      0,
    ),
    status: p.status,
    approvedBy: p.approvedBy,
    rejectionNote: p.rejectionNote,
  };
}

function nextId(existing: ExamPackage[]): string {
  const max = existing.reduce((acc, p) => {
    const m = /^PKG-(\d+)$/.exec(p.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `PKG-${String(max + 1).padStart(4, "0")}`;
}

const INITIAL_PACKAGES = isFirebaseConfigured() ? [] : SEED_PACKAGES;

export const usePackagesStore = create<State & Actions>()((set, get) => ({
  packages: INITIAL_PACKAGES,
  hydrated: false,

  create(input) {
    const id = nextId(get().packages);
    const now = new Date().toISOString();
    const pkg: ExamPackage = { ...input, id, createdAt: now, updatedAt: now };
    set({ packages: [pkg, ...get().packages] });
    writeDoc(
      COLLECTIONS.packages,
      id,
      sanitizeForFirestore(pkg as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "create",
      after: pickPackageAuditFields(pkg),
      campusId: pkg.campusId,
    });
    return pkg;
  },

  update(id, patch) {
    const before = get().packages.find((p) => p.id === id);
    const now = new Date().toISOString();
    set({
      packages: get().packages.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now } : p,
      ),
    });
    patchDoc(
      COLLECTIONS.packages,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "update",
      before: pickPackageAuditFields(before),
      after: pickPackageAuditFields(
        before ? { ...before, ...patch } : undefined,
      ),
      campusId: before?.campusId ?? null,
    });
  },

  archive(id, actorUid, reason) {
    const before = get().packages.find((p) => p.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamPackage> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    };
    set({
      packages: get().packages.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now } : p,
      ),
    });
    patchDoc(
      COLLECTIONS.packages,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "archive",
      before: pickPackageAuditFields(before),
      after: pickPackageAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
      reason,
    });
  },

  restore(id, actorUid) {
    const before = get().packages.find((p) => p.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<ExamPackage> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    set({
      packages: get().packages.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now } : p,
      ),
    });
    patchDoc(
      COLLECTIONS.packages,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "restore",
      before: pickPackageAuditFields(before),
      after: pickPackageAuditFields({ ...before, ...patch }),
      campusId: before.campusId,
    });
  },

  remove(id) {
    get().archive(id, "system", "Legacy remove() call");
  },

  cloneAsNewVersion(sourceId, actorUid, reason) {
    const source = get().packages.find((p) => p.id === sourceId);
    if (!source) return null;
    const id = nextId(get().packages);
    const now = new Date().toISOString();
    const { version, versionOfRootId } = nextVersionFields(source);
    const baseCopy = JSON.parse(JSON.stringify(source)) as ExamPackage;
    const clone: ExamPackage = {
      ...baseCopy,
      id,
      version,
      versionOfRootId,
      // Re-enter the approval workflow.
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
    set({ packages: [clone, ...get().packages] });
    writeDoc(
      COLLECTIONS.packages,
      id,
      sanitizeForFirestore(clone as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "lifecycle-transition",
      before: { sourceId, sourceVersion: versionOf(source) },
      after: {
        newVersion: version,
        rootId: rootId(source),
        status: "draft",
      },
      campusId: source.campusId,
      reason: reason ?? "Tạo phiên bản mới từ gói đề",
    });
    return clone;
  },

  setStatus(id, status, approverId, note) {
    const before = get().packages.find((p) => p.id === id);
    const patch: Partial<ExamPackage> = {
      status,
      approvedBy: status === "approved" ? approverId ?? null : null,
      rejectionNote: status === "rejected" ? note ?? null : null,
    };
    get().update(id, patch);
    // Emit the higher-fidelity action AFTER update() (which already
    // recorded a generic "update"). This second event tags it as an
    // approve/reject so audit drawers can filter on it.
    if (status === "approved" || status === "rejected") {
      recordAudit({
        entityType: "package",
        entityId: id,
        action: status === "approved" ? "approve" : "reject",
        before: pickPackageAuditFields(before),
        after: pickPackageAuditFields(
          before ? { ...before, ...patch } : undefined,
        ),
        campusId: before?.campusId ?? null,
        reason: note,
      });
    }
  },

  findById(id) {
    return get().packages.find((p) => p.id === id);
  },

  _applySnapshot(rows) {
    set({ packages: rows, hydrated: true });
  },
}));

export function subscribePackages(): Unsubscribe {
  return subscribeCollection<ExamPackage>({
    collectionName: COLLECTIONS.packages,
    fromDoc: (id, data) => ({ ...(data as ExamPackage), id }),
    onChange: (rows) => {
      if (rows.length === 0 && !usePackagesStore.getState().hydrated) {
        usePackagesStore.setState({ hydrated: true });
        return;
      }
      usePackagesStore.getState()._applySnapshot(rows);
    },
  });
}
