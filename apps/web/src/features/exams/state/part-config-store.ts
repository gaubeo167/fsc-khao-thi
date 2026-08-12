"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import type { ExamPartConfig } from "../data/types";

/** Deterministic doc id — one saved config per Môn + Khối. */
export function partConfigId(subjectId: string, gradeId: string): string {
  return `${subjectId}__${gradeId}`;
}

interface State {
  configs: ExamPartConfig[];
  hydrated: boolean;
}

interface Actions {
  /** The saved config for a Môn + Khối, or undefined. */
  get(subjectId: string, gradeId: string): ExamPartConfig | undefined;
  /** Create-or-replace the config for a Môn + Khối (upsert by deterministic id). */
  upsert(
    input: Omit<ExamPartConfig, "id" | "updatedAt"> & { updatedAt?: string },
  ): ExamPartConfig;

  _apply(rows: ExamPartConfig[]): void;
}

export const usePartConfigsStore = create<State & Actions>()((set, get) => ({
  configs: [],
  hydrated: false,

  get(subjectId, gradeId) {
    const id = partConfigId(subjectId, gradeId);
    return get().configs.find((c) => c.id === id);
  },

  upsert(input) {
    const id = partConfigId(input.subjectId, input.gradeId);
    const doc: ExamPartConfig = {
      ...input,
      id,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };
    set({
      configs: [...get().configs.filter((c) => c.id !== id), doc],
    });
    writeDoc(
      COLLECTIONS.examPartConfigs,
      id,
      sanitizeForFirestore(doc as unknown as Record<string, unknown>),
    );
    return doc;
  },

  _apply(rows) {
    set({ configs: rows, hydrated: true });
  },
}));

export function subscribePartConfigs(): Unsubscribe {
  return subscribeCollection<ExamPartConfig>({
    collectionName: COLLECTIONS.examPartConfigs,
    fromDoc: (id, data) => ({ ...(data as ExamPartConfig), id }),
    onChange: (rows) => usePartConfigsStore.getState()._apply(rows),
  });
}
