"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { recordAudit } from "@/lib/audit/record";
import { isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  removeDoc,
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
  remove(id: string): void;
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

  remove(id) {
    const before = get().packages.find((p) => p.id === id);
    set({ packages: get().packages.filter((p) => p.id !== id) });
    removeDoc(COLLECTIONS.packages, id);
    recordAudit({
      entityType: "package",
      entityId: id,
      action: "delete",
      before: pickPackageAuditFields(before),
      campusId: before?.campusId ?? null,
    });
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
