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
  SEED_QUESTIONS,
  type Question,
  type QuestionStatus,
} from "../data/seed-questions";

interface State {
  questions: Question[];
  hydrated: boolean;
}

interface Actions {
  /** Returns the created question with its new ID + timestamps assigned.
   *  The Firestore write happens in the background; local state is
   *  updated optimistically so callers can use the returned object
   *  immediately. */
  create(input: Omit<Question, "id" | "createdAt" | "updatedAt">): Question;
  update(id: string, patch: Partial<Question>): void;
  remove(id: string): void;
  setStatus(id: string, status: QuestionStatus, approverId?: string, note?: string): void;
  findById(id: string): Question | undefined;
  /** Internal — called by the Firestore snapshot listener. */
  _applySnapshot(rows: Question[]): void;
}

function nextId(existing: Question[]): string {
  const max = existing.reduce((acc, q) => {
    const m = /^Q-(\d+)$/.exec(q.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `Q-${String(max + 1).padStart(4, "0")}`;
}

// Pre-populate with seed only when Firebase isn't configured so the
// UI has demo data. With Firebase, wait for the snapshot to avoid the
// flash of stale / deleted seed entries on every load.
const INITIAL_QUESTIONS = isFirebaseConfigured() ? [] : SEED_QUESTIONS;

export const useQuestionsStore = create<State & Actions>()((set, get) => ({
  questions: INITIAL_QUESTIONS,
  hydrated: false,

  create(input) {
    const id = nextId(get().questions);
    const now = new Date().toISOString();
    const q = { ...input, id, createdAt: now, updatedAt: now } as Question;
    set({ questions: [q, ...get().questions] });
    writeDoc(COLLECTIONS.questions, id, sanitizeForFirestore(q as unknown as Record<string, unknown>));
    return q;
  },

  update(id, patch) {
    const now = new Date().toISOString();
    set({
      questions: get().questions.map((q) =>
        q.id === id ? ({ ...q, ...patch, updatedAt: now } as Question) : q,
      ),
    });
    patchDoc(
      COLLECTIONS.questions,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  remove(id) {
    set({ questions: get().questions.filter((q) => q.id !== id) });
    removeDoc(COLLECTIONS.questions, id);
  },

  setStatus(id, status, approverId, note) {
    const patch: Partial<Question> = {
      status,
      approvedBy: status === "approved" ? approverId ?? null : null,
      rejectionNote: status === "rejected" ? note ?? null : null,
    } as Partial<Question>;
    get().update(id, patch);
  },

  findById(id) {
    return get().questions.find((q) => q.id === id);
  },

  _applySnapshot(rows) {
    set({ questions: rows, hydrated: true });
  },
}));

/**
 * Listen to /questions. Firestore security rules filter what the caller
 * can read: personal-kho is owner-only; campus-kho is readable by anyone
 * in the same campus. Returns the unsubscribe fn.
 *
 * On the empty-collection case (fresh project), we keep the seed array
 * already in state so dev UI isn't empty. The first non-empty snapshot
 * replaces it.
 */
export function subscribeQuestions(): Unsubscribe {
  return subscribeCollection<Question>({
    collectionName: COLLECTIONS.questions,
    fromDoc: (id, data) => ({ ...(data as Question), id }),
    onChange: (rows) => {
      const current = useQuestionsStore.getState().questions.length;
      // Empty collection on a fresh project: don't blow away seed data.
      if (rows.length === 0 && !useQuestionsStore.getState().hydrated) {
        useQuestionsStore.setState({ hydrated: true });
        return;
      }
      // Defensive: if the snapshot collapses from many → zero,
      // that's almost always a permission-denied snapshot or a
      // transient Firestore glitch (we've seen it after copy in
      // strict-rule mode). Skip the clobber and warn — the next
      // good snapshot will catch up. Real "delete all" workflows
      // still work because they happen one delete at a time.
      if (current > 0 && rows.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(
          "[questions-store] suspicious empty snapshot after non-empty state — ignored to avoid data flash.",
        );
        return;
      }
      useQuestionsStore.getState()._applySnapshot(rows);
    },
  });
}
