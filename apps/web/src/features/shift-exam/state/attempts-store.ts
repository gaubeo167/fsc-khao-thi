"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import type { Question } from "@/features/question-bank/data/seed-questions";
import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

/**
 * Per-student exam attempt — one record per `(shiftId, studentId)`. Created
 * lazily when the student first opens the exam page; persisted incrementally
 * as they answer questions so a crash / reload doesn't lose work.
 */
export type Answer =
  | { kind: "mcq-single"; optionId: string | null }
  | { kind: "mcq-multi"; optionIds: string[] }
  | { kind: "true-false"; value: boolean | null }
  /** subQuestionId → boolean (student's answer for each sub-statement). */
  | { kind: "multi-tf"; values: Record<string, boolean> }
  | { kind: "short-answer"; text: string }
  | { kind: "fill-blank"; blanks: string[] }
  /** leftPairId → matched rightPairId chosen by the student. */
  | { kind: "matching"; pairings: Record<string, string> }
  /** Ordered list of item ids in the student's intended sequence. */
  | { kind: "ordering"; orderedIds: string[] }
  /** zoneIndex → chosen chip content for that drop zone. */
  | { kind: "drag-drop"; zones: string[] }
  /** Set of phrase strings the student chose to underline (from `[u:...]`). */
  | { kind: "underline"; underlinedPhrases: string[] }
  | { kind: "essay"; text: string }
  | { kind: "ai-generated"; text: string }
  | { kind: "unsupported" };

export type ViolationKind = "tabSwitches" | "fullscreenExits" | "pasteAttempts";

export interface ViolationEvent {
  kind: ViolationKind;
  at: string;
}

export interface StudentAttempt {
  id: string;
  shiftId: string;
  studentId: string;
  /** Campus this attempt belongs to — copied from the shift at start time
   *  so Firestore security rules can gate reads by campus. */
  campusId?: string | null;
  /** Snapshot of question ids assigned at start. Frozen for the run. */
  questionIds: string[];
  /** questionId → answer. */
  answers: Record<string, Answer>;
  /** questionIds the student flagged to revisit before submitting. */
  markedForReview: string[];
  startedAt: string;
  submittedAt: string | null;
  /** Filled at submit time — `null` for unsubmitted runs. */
  score: number | null;
  maxScore: number | null;
  correctCount: number | null;
  /** Anti-cheat counters captured during the attempt (best-effort). */
  violations: {
    tabSwitches: number;
    fullscreenExits: number;
    pasteAttempts: number;
  };
  /** Rolling window of the most recent ~30 violation events. */
  recentEvents?: ViolationEvent[];
}

interface State {
  attempts: StudentAttempt[];
  hydrated: boolean;
}

interface Actions {
  startOrResume(args: {
    shiftId: string;
    studentId: string;
    questionIds: string[];
    campusId?: string | null;
  }): StudentAttempt;
  saveAnswer(attemptId: string, questionId: string, answer: Answer): void;
  toggleMark(attemptId: string, questionId: string): void;
  recordViolation(
    attemptId: string,
    kind: keyof StudentAttempt["violations"],
  ): void;
  submit(attemptId: string, questions: Question[]): StudentAttempt | null;
  findById(id: string): StudentAttempt | undefined;
  findForShift(shiftId: string, studentId: string): StudentAttempt | undefined;
  listForStudent(studentId: string): StudentAttempt[];
  _applySnapshot(rows: StudentAttempt[]): void;
}

function newAttemptId(shiftId: string, studentId: string): string {
  return `att-${shiftId}-${studentId}`;
}

function gradeOne(
  q: Question,
  a: Answer | undefined,
): { points: number; correct: boolean } | null {
  if (!a) return { points: 0, correct: false };
  switch (q.type) {
    case "mcq-single": {
      if (a.kind !== "mcq-single" || !a.optionId) return { points: 0, correct: false };
      const correct = q.options.find((o) => o.isCorrect)?.id;
      return correct === a.optionId
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "mcq-multi": {
      if (a.kind !== "mcq-multi") return { points: 0, correct: false };
      const correctIds = new Set(
        q.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      const chosen = new Set(a.optionIds);
      const same =
        chosen.size === correctIds.size &&
        Array.from(correctIds).every((id) => chosen.has(id));
      return same ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "true-false": {
      if (a.kind !== "true-false" || a.value == null)
        return { points: 0, correct: false };
      return a.value === q.correctAnswer
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "short-answer": {
      if (a.kind !== "short-answer") return { points: 0, correct: false };
      const norm = (s: string) =>
        q.caseSensitive ? s.trim() : s.trim().toLowerCase();
      const accepted = q.acceptedAnswers.map(norm);
      return accepted.includes(norm(a.text))
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "fill-blank": {
      if (a.kind !== "fill-blank") return { points: 0, correct: false };
      const allOk = q.blanks.every((b, i) => {
        const guess = (a.blanks[i] ?? "").trim().toLowerCase();
        return b.acceptedAnswers
          .map((s) => s.trim().toLowerCase())
          .includes(guess);
      });
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "multi-tf": {
      if (a.kind !== "multi-tf") return { points: 0, correct: false };
      const allOk = q.subQuestions.every(
        (sub) => a.values[sub.id] === sub.correctAnswer,
      );
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "matching": {
      if (a.kind !== "matching") return { points: 0, correct: false };
      const allOk = q.pairs.every((p) => a.pairings[p.id] === p.id);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "ordering": {
      if (a.kind !== "ordering") return { points: 0, correct: false };
      const correct = q.items.map((it) => it.id);
      const allOk =
        a.orderedIds.length === correct.length &&
        a.orderedIds.every((id, i) => id === correct[i]);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "drag-drop": {
      if (a.kind !== "drag-drop") return { points: 0, correct: false };
      const norm = (s: string) => (s ?? "").trim().toLowerCase();
      const allOk = q.zones.every(
        (z, i) => norm(a.zones[i] ?? "") === norm(z.correctContent),
      );
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "underline": {
      if (a.kind !== "underline") return { points: 0, correct: false };
      const correctSet = new Set<string>();
      const re = /\[u:([^\]\n]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        correctSet.add(m[1]!.trim().toLowerCase());
      }
      const studentSet = new Set(
        a.underlinedPhrases.map((p) => p.trim().toLowerCase()),
      );
      const exactMatch =
        studentSet.size === correctSet.size &&
        Array.from(correctSet).every((p) => studentSet.has(p));
      return exactMatch
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "essay":
    case "ai-generated":
      return null;
    default:
      return null;
  }
}

/** Build the Firestore payload for an attempt — strips undefined fields. */
function toDoc(att: StudentAttempt): Record<string, unknown> {
  return sanitizeForFirestore(att as unknown as Record<string, unknown>);
}

export const useAttemptsStore = create<State & Actions>()((set, get) => ({
  attempts: [],
  hydrated: false,

  startOrResume({ shiftId, studentId, questionIds, campusId }) {
    const existing = get().attempts.find(
      (a) => a.shiftId === shiftId && a.studentId === studentId,
    );
    if (existing) return existing;
    const att: StudentAttempt = {
      id: newAttemptId(shiftId, studentId),
      shiftId,
      studentId,
      campusId: campusId ?? null,
      questionIds,
      answers: {},
      markedForReview: [],
      startedAt: new Date().toISOString(),
      submittedAt: null,
      score: null,
      maxScore: null,
      correctCount: null,
      violations: { tabSwitches: 0, fullscreenExits: 0, pasteAttempts: 0 },
      recentEvents: [],
    };
    set({ attempts: [att, ...get().attempts] });
    writeDoc(COLLECTIONS.attempts, att.id, toDoc(att));
    return att;
  },

  saveAnswer(attemptId, questionId, answer) {
    let nextDoc: StudentAttempt | undefined;
    set({
      attempts: get().attempts.map((a) => {
        if (a.id !== attemptId || a.submittedAt != null) return a;
        const next = { ...a, answers: { ...a.answers, [questionId]: answer } };
        nextDoc = next;
        return next;
      }),
    });
    if (nextDoc) {
      // Persist only the changed answers map — saves Firestore bandwidth.
      patchDoc(COLLECTIONS.attempts, attemptId, {
        answers: sanitizeForFirestore(nextDoc.answers),
      });
    }
  },

  toggleMark(attemptId, questionId) {
    let nextMarks: string[] | undefined;
    set({
      attempts: get().attempts.map((a) => {
        if (a.id !== attemptId || a.submittedAt != null) return a;
        const has = a.markedForReview.includes(questionId);
        const marks = has
          ? a.markedForReview.filter((x) => x !== questionId)
          : [...a.markedForReview, questionId];
        nextMarks = marks;
        return { ...a, markedForReview: marks };
      }),
    });
    if (nextMarks) {
      patchDoc(COLLECTIONS.attempts, attemptId, {
        markedForReview: nextMarks,
      });
    }
  },

  recordViolation(attemptId, kind) {
    let nextViol: StudentAttempt["violations"] | undefined;
    let nextEvents: ViolationEvent[] | undefined;
    set({
      attempts: get().attempts.map((a) => {
        if (a.id !== attemptId || a.submittedAt != null) return a;
        nextEvents = [
          ...(a.recentEvents ?? []),
          { kind, at: new Date().toISOString() },
        ].slice(-30);
        nextViol = { ...a.violations, [kind]: a.violations[kind] + 1 };
        return { ...a, violations: nextViol, recentEvents: nextEvents };
      }),
    });
    if (nextViol && nextEvents) {
      patchDoc(COLLECTIONS.attempts, attemptId, {
        violations: nextViol,
        recentEvents: nextEvents,
      });
    }
  },

  submit(attemptId, questions) {
    const att = get().attempts.find((a) => a.id === attemptId);
    if (!att || att.submittedAt != null) return att ?? null;
    const qById = new Map(questions.map((q) => [q.id, q]));
    let correctCount = 0;
    let scored = 0;
    let max = 0;
    for (const qid of att.questionIds) {
      const q = qById.get(qid);
      if (!q) continue;
      const result = gradeOne(q, att.answers[qid]);
      if (result == null) continue;
      max += 1;
      if (result.correct) correctCount += 1;
      scored += result.points;
    }
    const submittedAt = new Date().toISOString();
    const score = max > 0 ? Math.round((scored / max) * 100) : 0;
    const next: StudentAttempt = {
      ...att,
      submittedAt,
      score,
      maxScore: max,
      correctCount,
    };
    set({
      attempts: get().attempts.map((a) => (a.id === attemptId ? next : a)),
    });
    patchDoc(COLLECTIONS.attempts, attemptId, {
      submittedAt,
      score,
      maxScore: max,
      correctCount,
    });
    return next;
  },

  findById(id) {
    return get().attempts.find((a) => a.id === id);
  },
  findForShift(shiftId, studentId) {
    return get().attempts.find(
      (a) => a.shiftId === shiftId && a.studentId === studentId,
    );
  },
  listForStudent(studentId) {
    return get().attempts.filter((a) => a.studentId === studentId);
  },

  _applySnapshot(rows) {
    set({ attempts: rows, hydrated: true });
  },
}));

export function subscribeAttempts(): Unsubscribe {
  return subscribeCollection<StudentAttempt>({
    collectionName: COLLECTIONS.attempts,
    fromDoc: (id, data) => ({ ...(data as StudentAttempt), id }),
    onChange: (rows) => {
      useAttemptsStore.getState()._applySnapshot(rows);
    },
  });
}
