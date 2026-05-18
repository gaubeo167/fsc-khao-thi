"use client";

import { create } from "zustand";
import { debouncedLocalStorage } from "@/lib/debounced-local-storage";
import { persist } from "zustand/middleware";

/**
 * Lightweight notification feed targeted at a specific user. The classic
 * use case is "shift reminder" — admin clicks "Gửi nhắc nhở" on a shift
 * in the schedule view and one notification is created per assigned
 * student.
 *
 * The store is intentionally generic so future kinds (homework due,
 * grade published, system announcement) drop in without a migration.
 */
export type NotificationKind =
  | "shift-reminder"
  | "shift-update"
  | "grade-published"
  | "system";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Optional CTA — pushed onto the dashboard "Mở" button. */
  link?: string | null;
  /** What thing this notification refers to (vd shift id) — for de-dup. */
  refId?: string | null;
  senderId: string;
  senderName: string;
  createdAt: string;
  readAt: string | null;
}

interface State {
  notifications: Notification[];
}

interface Actions {
  /** Insert one notification. */
  push(input: Omit<Notification, "id" | "createdAt" | "readAt">): Notification;
  /** Insert a batch of notifications (one per user). */
  pushMany(
    inputs: Array<Omit<Notification, "id" | "createdAt" | "readAt">>,
  ): Notification[];
  markRead(id: string): void;
  markAllReadFor(userId: string): void;
  forUser(userId: string): Notification[];
  unreadCount(userId: string): number;
}

function newId(): string {
  return `notif-${Math.random().toString(36).slice(2, 12)}`;
}

export const useNotificationsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      notifications: [],

      push(input) {
        const n: Notification = {
          ...input,
          id: newId(),
          createdAt: new Date().toISOString(),
          readAt: null,
        };
        set({ notifications: [n, ...get().notifications] });
        return n;
      },

      pushMany(inputs) {
        const now = new Date().toISOString();
        const list: Notification[] = inputs.map((input) => ({
          ...input,
          id: newId(),
          createdAt: now,
          readAt: null,
        }));
        set({ notifications: [...list, ...get().notifications] });
        return list;
      },

      markRead(id) {
        set({
          notifications: get().notifications.map((n) =>
            n.id === id && n.readAt == null
              ? { ...n, readAt: new Date().toISOString() }
              : n,
          ),
        });
      },

      markAllReadFor(userId) {
        const now = new Date().toISOString();
        set({
          notifications: get().notifications.map((n) =>
            n.userId === userId && n.readAt == null ? { ...n, readAt: now } : n,
          ),
        });
      },

      forUser(userId) {
        return get()
          .notifications.filter((n) => n.userId === userId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime(),
          );
      },

      unreadCount(userId) {
        return get().notifications.filter(
          (n) => n.userId === userId && n.readAt == null,
        ).length;
      },
    }),
    {
      name: "fsc-notifications",
      version: 1,
      storage: debouncedLocalStorage,
      partialize: (s) => ({ notifications: s.notifications }),
    },
  ),
);
