"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

/**
 * Proctor-issued messages: warnings sent to a specific student during a
 * shift, plus violation logs the proctor manually filed (separate from
 * the auto-detected anti-cheat counters in attempts-store).
 *
 * Events live in Firestore under `/proctor_events` so the proctor's
 * machine (one tab / device) and the student's machine (a different
 * one) see the same stream in real time.
 */
export type ProctorEventKind = "warning" | "violation" | "info";

export interface ProctorEvent {
  id: string;
  shiftId: string;
  studentId: string;
  proctorId: string;
  proctorName: string;
  kind: ProctorEventKind;
  /** Free-text body — what the proctor wants the student to read. */
  body: string;
  /** Optional pre-canned tag (e.g. "Nói chuyện riêng"). */
  tag?: string | null;
  createdAt: string;
  /** When the student first saw / dismissed the toast. */
  acknowledgedAt?: string | null;
}

interface State {
  events: ProctorEvent[];
  hydrated: boolean;
}

interface Actions {
  send(
    input: Omit<ProctorEvent, "id" | "createdAt" | "acknowledgedAt">,
  ): ProctorEvent;
  acknowledge(id: string): void;
  forShift(shiftId: string): ProctorEvent[];
  forStudent(shiftId: string, studentId: string): ProctorEvent[];
  _applySnapshot(events: ProctorEvent[]): void;
}

function nextId(): string {
  return `pev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useProctorStore = create<State & Actions>()((set, get) => ({
  events: [],
  hydrated: false,

  send(input) {
    const id = nextId();
    const ev: ProctorEvent = {
      ...input,
      id,
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
    };
    set({ events: [ev, ...get().events] });
    writeDoc(
      COLLECTIONS.proctorEvents,
      id,
      sanitizeForFirestore(ev as unknown as Record<string, unknown>),
    );
    return ev;
  },

  acknowledge(id) {
    const now = new Date().toISOString();
    set({
      events: get().events.map((e) =>
        e.id === id && e.acknowledgedAt == null ? { ...e, acknowledgedAt: now } : e,
      ),
    });
    patchDoc(COLLECTIONS.proctorEvents, id, { acknowledgedAt: now });
  },

  forShift(shiftId) {
    return get().events.filter((e) => e.shiftId === shiftId);
  },
  forStudent(shiftId, studentId) {
    return get().events.filter(
      (e) => e.shiftId === shiftId && e.studentId === studentId,
    );
  },

  _applySnapshot(events) {
    set({ events, hydrated: true });
  },
}));

export function subscribeProctorEvents(): Unsubscribe {
  return subscribeCollection<ProctorEvent>({
    collectionName: COLLECTIONS.proctorEvents,
    fromDoc: (id, data) => ({ ...(data as ProctorEvent), id }),
    onChange: (rows) => {
      useProctorStore.getState()._applySnapshot(rows);
    },
  });
}
