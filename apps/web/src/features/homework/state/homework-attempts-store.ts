"use client";

import { where, type Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import type { Question } from "@/features/question-bank/data/seed-questions";
import { isCorrect } from "@/features/shift-exam/lib/is-correct";
import type { Answer } from "@/features/shift-exam/state/attempts-store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import type { HomeworkAttempt } from "../data/types";

interface State {
  attempts: HomeworkAttempt[];
  hydrated: boolean;
}

interface Actions {
  startOrResume(args: {
    homeworkId: string;
    studentId: string;
    campusId?: string | null;
  }): HomeworkAttempt;
  saveAnswer(attemptId: string, questionId: string, answer: Answer): void;
  toggleMark(attemptId: string, questionId: string): void;
  /** Grade + submit. Caller passes the questions in the homework so we
   *  can run isCorrect() on each answer. */
  /**
   * Finalize a homework attempt. In production (Firebase configured) it is
   * SERVER-AUTHORITATIVE: POSTs answers to /api/homework/[id]/submit which
   * grades with the Admin SDK and writes correctCount/submittedAt. Demo
   * mode grades locally. Async in both cases.
   */
  submit(attemptId: string, questions: Question[]): Promise<HomeworkAttempt | null>;
  findById(id: string): HomeworkAttempt | undefined;
  findForStudent(homeworkId: string, studentId: string): HomeworkAttempt | undefined;
  _applySnapshot(rows: HomeworkAttempt[]): void;
}

function newId(homeworkId: string, studentId: string): string {
  return `hw-att-${homeworkId}-${studentId}`;
}

function toDoc(a: HomeworkAttempt) {
  return sanitizeForFirestore(a as unknown as Record<string, unknown>);
}

export const useHomeworkAttemptsStore = create<State & Actions>()(
  (set, get) => ({
    attempts: [],
    hydrated: false,

    startOrResume({ homeworkId, studentId, campusId }) {
      const existing = get().attempts.find(
        (a) => a.homeworkId === homeworkId && a.studentId === studentId,
      );
      if (existing) return existing;
      const att: HomeworkAttempt = {
        id: newId(homeworkId, studentId),
        homeworkId,
        studentId,
        campusId: campusId ?? null,
        answers: {},
        markedForReview: [],
        startedAt: new Date().toISOString(),
        submittedAt: null,
        correctCount: null,
        totalQuestions: null,
      };
      set({ attempts: [att, ...get().attempts] });
      writeDoc(COLLECTIONS.homeworkAttempts, att.id, toDoc(att));
      return att;
    },

    saveAnswer(attemptId, questionId, answer) {
      let nextDoc: HomeworkAttempt | undefined;
      set({
        attempts: get().attempts.map((a) => {
          if (a.id !== attemptId || a.submittedAt != null) return a;
          const next = { ...a, answers: { ...a.answers, [questionId]: answer } };
          nextDoc = next;
          return next;
        }),
      });
      if (nextDoc) {
        patchDoc(COLLECTIONS.homeworkAttempts, attemptId, {
          answers: nextDoc.answers,
        });
      }
    },

    toggleMark(attemptId, questionId) {
      let nextDoc: HomeworkAttempt | undefined;
      set({
        attempts: get().attempts.map((a) => {
          if (a.id !== attemptId || a.submittedAt != null) return a;
          const marked = a.markedForReview.includes(questionId)
            ? a.markedForReview.filter((q) => q !== questionId)
            : [...a.markedForReview, questionId];
          const next = { ...a, markedForReview: marked };
          nextDoc = next;
          return next;
        }),
      });
      if (nextDoc) {
        patchDoc(COLLECTIONS.homeworkAttempts, attemptId, {
          markedForReview: nextDoc.markedForReview,
        });
      }
    },

    async submit(attemptId, questions) {
      const att = get().attempts.find((a) => a.id === attemptId);
      if (!att || att.submittedAt != null) return att ?? null;

      // ── Production: server-authoritative grading ────────────────────
      if (isFirebaseConfigured()) {
        try {
          const { authHeaders } = await import("@/lib/api-client");
          const res = await fetch(`/api/homework/${att.homeworkId}/submit`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ answers: att.answers }),
          });
          if (res.status === 409) {
            const done = { ...att, submittedAt: att.submittedAt ?? new Date().toISOString() };
            set({ attempts: get().attempts.map((x) => (x.id === attemptId ? done : x)) });
            return done;
          }
          if (!res.ok) {
            // eslint-disable-next-line no-console
            console.error("[homework] server submit failed", res.status);
            return null;
          }
          const data = (await res.json()) as {
            correctCount: number;
            totalQuestions: number;
            submittedAt: string;
          };
          const updated: HomeworkAttempt = {
            ...att,
            submittedAt: data.submittedAt,
            correctCount: data.correctCount,
            totalQuestions: data.totalQuestions,
          };
          set({ attempts: get().attempts.map((x) => (x.id === attemptId ? updated : x)) });
          return updated;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[homework] server submit error", e);
          return null;
        }
      }

      // ── Demo mode: grade locally ────────────────────────────────────
      let correctCount = 0;
      for (const q of questions) {
        const a = att.answers[q.id];
        if (a && isCorrect(q, a)) correctCount++;
      }
      const updated: HomeworkAttempt = {
        ...att,
        submittedAt: new Date().toISOString(),
        correctCount,
        totalQuestions: questions.length,
      };
      set({
        attempts: get().attempts.map((x) => (x.id === attemptId ? updated : x)),
      });
      patchDoc(COLLECTIONS.homeworkAttempts, attemptId, {
        submittedAt: updated.submittedAt,
        correctCount: updated.correctCount,
        totalQuestions: updated.totalQuestions,
      });
      return updated;
    },

    findById(id) {
      return get().attempts.find((a) => a.id === id);
    },

    findForStudent(homeworkId, studentId) {
      return get().attempts.find(
        (a) => a.homeworkId === homeworkId && a.studentId === studentId,
      );
    },

    _applySnapshot(rows) {
      set({ attempts: rows, hydrated: true });
    },
  }),
);

/**
 * Subscribe to homework attempts.
 *
 * Pass `{ studentId }` for student sessions so the listener only watches
 * that student's own attempts (`where studentId == uid`). This is
 * essential at scale: without it every student would re-download — and be
 * billed for — every other student's attempt on each save. Teachers /
 * admins call with no args to read all attempts for the stats page.
 */
export function subscribeHomeworkAttempts(opts?: {
  studentId?: string;
}): Unsubscribe {
  if (!isFirebaseConfigured()) {
    useHomeworkAttemptsStore.getState()._applySnapshot([]);
    return () => {
      /* no-op */
    };
  }
  return subscribeCollection<HomeworkAttempt>({
    collectionName: COLLECTIONS.homeworkAttempts,
    constraints: opts?.studentId
      ? [where("studentId", "==", opts.studentId)]
      : [],
    fromDoc: (id, data) => ({ ...(data as HomeworkAttempt), id }),
    onChange: (rows) =>
      useHomeworkAttemptsStore.getState()._applySnapshot(rows),
  });
}
