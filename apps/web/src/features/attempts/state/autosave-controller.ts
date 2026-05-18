"use client";

import { useEffect, useMemo, useRef } from "react";

import { saveResponse } from "../api/attempts-api";
import { useRuntimeStore } from "./runtime-store";

const DEBOUNCE_MS = 600;

export interface AutosaveController {
  schedule(questionId: string, payload: string): void;
  flushAll(opts?: { keepalive?: boolean }): Promise<void>;
  destroy(): void;
}

function buildController(attemptId: string): AutosaveController {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  async function send(questionId: string, payload: string, opts: { keepalive?: boolean } = {}) {
    const store = useRuntimeStore.getState();
    if (store.locked) return;
    store.setStatus(questionId, "saving");
    try {
      await saveResponse(attemptId, { questionId, payload }, { keepalive: opts.keepalive });
      // If the user changed the draft mid-flight, leave the newer "dirty" alone.
      const cur = useRuntimeStore.getState();
      if (cur.drafts[questionId] === payload) {
        cur.markSaved(questionId);
      }
    } catch (err) {
      useRuntimeStore.getState().setStatus(questionId, "error");
      console.warn("[autosave] save failed", { questionId, err });
    }
  }

  return {
    schedule(questionId, payload) {
      const existing = timers.get(questionId);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timers.delete(questionId);
        void send(questionId, payload);
      }, DEBOUNCE_MS);
      timers.set(questionId, t);
    },

    async flushAll(opts = {}) {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      const pending = useRuntimeStore.getState().collectDirty();
      await Promise.all(
        pending.map((p) => send(p.questionId, p.payload, { keepalive: opts.keepalive })),
      );
    },

    destroy() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}

/**
 * Owns one autosave controller per attempt mount, plus the
 * online/visibility/beforeunload bridges that keep buffered drafts safe.
 */
export function useAutosaveController(attemptId: string | null): AutosaveController | null {
  const controllerRef = useRef<AutosaveController | null>(null);

  const controller = useMemo(() => {
    if (!attemptId) return null;
    controllerRef.current?.destroy();
    const c = buildController(attemptId);
    controllerRef.current = c;
    return c;
  }, [attemptId]);

  useEffect(() => {
    if (!controller) return;

    const onOnline = () => void controller.flushAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void controller.flushAll({ keepalive: true });
      }
    };
    const onBeforeUnload = () => {
      void controller.flushAll({ keepalive: true });
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    // On mount, retry anything stuck as dirty/error from a previous session.
    void controller.flushAll();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      controller.destroy();
    };
  }, [controller]);

  return controller;
}
