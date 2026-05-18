"use client";

import type { ResponseDto } from "@fsc/shared";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { SaveStatus } from "../types";

interface RuntimeState {
  attemptId: string | null;
  endsAt: number | null;
  currentIndex: number;
  drafts: Record<string, string>;
  statuses: Record<string, SaveStatus>;
  lastSavedAt: Record<string, number>;
  locked: boolean;
}

export interface HydrateInput {
  attemptId: string;
  remainingTimeMs: number;
  locked: boolean;
  responses: ResponseDto[];
}

interface RuntimeActions {
  hydrate(input: HydrateInput): void;
  setIndex(index: number): void;
  setDraft(questionId: string, value: string): void;
  setStatus(questionId: string, status: SaveStatus): void;
  markSaved(questionId: string): void;
  setLocked(locked: boolean): void;
  collectDirty(): Array<{ questionId: string; payload: string }>;
  reset(): void;
}

const initial: RuntimeState = {
  attemptId: null,
  endsAt: null,
  currentIndex: 0,
  drafts: {},
  statuses: {},
  lastSavedAt: {},
  locked: false,
};

export const useRuntimeStore = create<RuntimeState & RuntimeActions>()(
  persist(
    (set, get) => ({
      ...initial,

      hydrate({ attemptId, remainingTimeMs, locked, responses }) {
        const prev = get();
        const newEndsAt = Date.now() + remainingTimeMs;
        const now = Date.now();

        if (prev.attemptId !== attemptId) {
          // Fresh attempt — server is the source of truth.
          const drafts: Record<string, string> = {};
          const statuses: Record<string, SaveStatus> = {};
          const lastSavedAt: Record<string, number> = {};
          for (const r of responses) {
            drafts[r.questionId] = r.payload;
            statuses[r.questionId] = "saved";
            lastSavedAt[r.questionId] = now;
          }
          set({
            ...initial,
            attemptId,
            endsAt: newEndsAt,
            locked,
            drafts,
            statuses,
            lastSavedAt,
          });
          return;
        }

        // Same attempt — preserve local pending edits, only fill gaps.
        const drafts = { ...prev.drafts };
        const statuses = { ...prev.statuses };
        const lastSavedAt = { ...prev.lastSavedAt };

        for (const r of responses) {
          const localStatus = statuses[r.questionId];
          const isPendingLocal =
            localStatus === "dirty" ||
            localStatus === "saving" ||
            localStatus === "error";
          if (isPendingLocal) continue;

          drafts[r.questionId] = r.payload;
          statuses[r.questionId] = "saved";
          lastSavedAt[r.questionId] = now;
        }

        set({ endsAt: newEndsAt, locked, drafts, statuses, lastSavedAt });
      },

      setIndex(index) {
        set({ currentIndex: index });
      },

      setDraft(questionId, value) {
        set((s) => ({
          drafts: { ...s.drafts, [questionId]: value },
          statuses: { ...s.statuses, [questionId]: "dirty" },
        }));
      },

      setStatus(questionId, status) {
        set((s) => ({ statuses: { ...s.statuses, [questionId]: status } }));
      },

      markSaved(questionId) {
        set((s) => ({
          statuses: { ...s.statuses, [questionId]: "saved" },
          lastSavedAt: { ...s.lastSavedAt, [questionId]: Date.now() },
        }));
      },

      setLocked(locked) {
        set({ locked });
      },

      collectDirty() {
        const { drafts, statuses } = get();
        return Object.entries(drafts)
          .filter(([qid]) => {
            const s = statuses[qid];
            return s === "dirty" || s === "error";
          })
          .map(([questionId, payload]) => ({ questionId, payload }));
      },

      reset() {
        set(initial);
      },
    }),
    {
      name: "fsc-runtime",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        attemptId: s.attemptId,
        endsAt: s.endsAt,
        currentIndex: s.currentIndex,
        drafts: s.drafts,
        statuses: Object.fromEntries(
          Object.entries(s.statuses).map(([k, v]) =>
            // Don't persist transient saving — it should reappear as "needs send".
            [k, v === "saving" ? "dirty" : v],
          ),
        ),
        lastSavedAt: s.lastSavedAt,
      }),
    },
  ),
);

export type RuntimeStore = ReturnType<typeof useRuntimeStore.getState>;
