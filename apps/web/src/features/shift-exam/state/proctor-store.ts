"use client";

import { create } from "zustand";
import { debouncedLocalStorage } from "@/lib/debounced-local-storage";
import { persist } from "zustand/middleware";

/**
 * Proctor-issued messages: warnings sent to a specific student during a
 * shift, plus violation logs the proctor manually filed (separate from
 * the auto-detected anti-cheat counters in attempts-store).
 *
 * Both flow through the same store so a single subscription on the
 * student / monitor side picks up everything in chronological order.
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
}

interface Actions {
  send(input: Omit<ProctorEvent, "id" | "createdAt" | "acknowledgedAt">): ProctorEvent;
  acknowledge(id: string): void;
  forShift(shiftId: string): ProctorEvent[];
  forStudent(shiftId: string, studentId: string): ProctorEvent[];
}

function nextId(): string {
  return `pev-${Math.random().toString(36).slice(2, 10)}`;
}

export const useProctorStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      events: [],

      send(input) {
        const ev: ProctorEvent = {
          ...input,
          id: nextId(),
          createdAt: new Date().toISOString(),
          acknowledgedAt: null,
        };
        set({ events: [ev, ...get().events] });
        return ev;
      },

      acknowledge(id) {
        set({
          events: get().events.map((e) =>
            e.id === id && e.acknowledgedAt == null
              ? { ...e, acknowledgedAt: new Date().toISOString() }
              : e,
          ),
        });
      },

      forShift(shiftId) {
        return get().events.filter((e) => e.shiftId === shiftId);
      },
      forStudent(shiftId, studentId) {
        return get().events.filter(
          (e) => e.shiftId === shiftId && e.studentId === studentId,
        );
      },
    }),
    {
      name: "fsc-proctor-events",
      version: 1,
      storage: debouncedLocalStorage,
      partialize: (s) => ({ events: s.events }),
    },
  ),
);
