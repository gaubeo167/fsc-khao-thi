"use client";

import { create } from "zustand";
import { debouncedLocalStorage } from "@/lib/debounced-local-storage";
import { persist } from "zustand/middleware";

import { SEED_GENERATED } from "../data/seeds";
import type { GeneratedExam } from "../data/types";

interface State {
  generated: GeneratedExam[];
}

interface Actions {
  /** Append a batch of newly-generated exams (returns the new exams). */
  addBatch(
    input: Omit<GeneratedExam, "id" | "createdAt" | "name">[],
    nameTemplate?: (index: number) => string,
  ): GeneratedExam[];
  remove(id: string): void;
  removeByPackage(packageId: string): void;
  findById(id: string): GeneratedExam | undefined;
}

function nextId(existing: GeneratedExam[]): string {
  const max = existing.reduce((acc, e) => {
    const m = /^EX-(\d+)$/.exec(e.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `EX-${String(max + 1).padStart(5, "0")}`;
}

export const useGeneratedStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      generated: SEED_GENERATED,

      addBatch(input, nameTemplate) {
        const now = new Date().toISOString();
        // Pre-compute next ids by simulating creation
        const existing = [...get().generated];
        const created: GeneratedExam[] = [];
        for (let i = 0; i < input.length; i++) {
          const id = nextId(existing);
          const name =
            nameTemplate?.(i + 1) ?? `Đề ${String(i + 1).padStart(3, "0")}`;
          const exam: GeneratedExam = {
            ...input[i]!,
            id,
            name,
            createdAt: now,
          };
          existing.unshift(exam);
          created.push(exam);
        }
        set({ generated: existing });
        return created;
      },

      remove(id) {
        set({ generated: get().generated.filter((e) => e.id !== id) });
      },

      removeByPackage(packageId) {
        set({
          generated: get().generated.filter((e) => e.packageId !== packageId),
        });
      },

      findById(id) {
        return get().generated.find((e) => e.id === id);
      },
    }),
    {
      name: "fsc-generated-exams",
      version: 1,
      storage: debouncedLocalStorage,
      partialize: (s) => ({ generated: s.generated }),
    },
  ),
);
