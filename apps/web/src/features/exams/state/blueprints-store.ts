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
  remove(id: string): void;
  findById(id: string): ExamBlueprint | undefined;
  _applySnapshot(rows: ExamBlueprint[]): void;
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
    return blueprint;
  },

  update(id, patch) {
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
  },

  remove(id) {
    set({ blueprints: get().blueprints.filter((b) => b.id !== id) });
    removeDoc(COLLECTIONS.blueprints, id);
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
