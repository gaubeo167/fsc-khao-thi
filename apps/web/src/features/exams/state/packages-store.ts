"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

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
    return pkg;
  },

  update(id, patch) {
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
  },

  remove(id) {
    set({ packages: get().packages.filter((p) => p.id !== id) });
    removeDoc(COLLECTIONS.packages, id);
  },

  setStatus(id, status, approverId, note) {
    const patch: Partial<ExamPackage> = {
      status,
      approvedBy: status === "approved" ? approverId ?? null : null,
      rejectionNote: status === "rejected" ? note ?? null : null,
    };
    get().update(id, patch);
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
