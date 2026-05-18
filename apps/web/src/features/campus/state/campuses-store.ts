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

import {
  gradeIdsForTier,
  SEED_CAMPUSES,
  type Campus,
  type CampusTier,
} from "../data/seed-campuses";

interface State {
  campuses: Campus[];
  hydrated: boolean;
}

interface Actions {
  create(
    input: Omit<Campus, "id" | "createdAt" | "gradeIds"> & {
      gradeIds?: string[];
    },
  ): Campus;
  update(id: string, patch: Partial<Campus>): void;
  remove(id: string): void;
  findById(id: string): Campus | undefined;

  _applySnapshot(rows: Campus[]): void;
}

function slugifyCode(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nextId(existing: Campus[], code: string): string {
  const slug = slugifyCode(code) || "campus";
  let id = `campus-${slug}`;
  if (!existing.some((c) => c.id === id)) return id;
  let n = 2;
  while (existing.some((c) => c.id === `${id}-${n}`)) n++;
  return `${id}-${n}`;
}

// When Firebase is configured, start empty and wait for the first
// snapshot — avoids the "deleted campus reappears for ~1s on every
// page load" flash that happened when we pre-populated with the
// hardcoded SEED_CAMPUSES array. Seed data is only useful as a UI
// preview when no backend is configured (local dev / demo mode).
const INITIAL_CAMPUSES: Campus[] = isFirebaseConfigured() ? [] : SEED_CAMPUSES;

export const useCampusesStore = create<State & Actions>()((set, get) => ({
  campuses: INITIAL_CAMPUSES,
  hydrated: false,

  create(input) {
    const id = nextId(get().campuses, input.code);
    const now = new Date().toISOString();
    const gradeIds = input.gradeIds ?? gradeIdsForTier(input.tier);
    const campus: Campus = {
      ...input,
      id,
      gradeIds,
      createdAt: now,
    };
    set({ campuses: [...get().campuses, campus] });
    writeDoc(
      COLLECTIONS.campuses,
      id,
      sanitizeForFirestore(campus as unknown as Record<string, unknown>),
    );
    return campus;
  },

  update(id, patch) {
    let nextCampus: Campus | undefined;
    set({
      campuses: get().campuses.map((c) => {
        if (c.id !== id) return c;
        const tierChanged = patch.tier && patch.tier !== c.tier;
        const nextTier: CampusTier = patch.tier ?? c.tier;
        const gradeIds = patch.gradeIds
          ? patch.gradeIds
          : tierChanged
            ? gradeIdsForTier(nextTier)
            : c.gradeIds;
        nextCampus = { ...c, ...patch, tier: nextTier, gradeIds };
        return nextCampus;
      }),
    });
    if (nextCampus) {
      patchDoc(
        COLLECTIONS.campuses,
        id,
        sanitizeForFirestore(nextCampus as unknown as Record<string, unknown>),
      );
    }
  },

  remove(id) {
    set({ campuses: get().campuses.filter((c) => c.id !== id) });
    removeDoc(COLLECTIONS.campuses, id);
  },

  findById(id) {
    return get().campuses.find((c) => c.id === id);
  },

  _applySnapshot(rows) {
    set({ campuses: rows, hydrated: true });
  },
}));

export function subscribeCampuses(): Unsubscribe {
  return subscribeCollection<Campus>({
    collectionName: COLLECTIONS.campuses,
    fromDoc: (id, data) => ({ ...(data as Campus), id }),
    onChange: (rows) => {
      if (rows.length === 0 && !useCampusesStore.getState().hydrated) {
        useCampusesStore.setState({ hydrated: true });
        return;
      }
      useCampusesStore.getState()._applySnapshot(rows);
    },
  });
}
