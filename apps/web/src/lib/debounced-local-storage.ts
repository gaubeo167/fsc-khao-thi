import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * Zustand persist talks to `localStorage` synchronously on every `set()` call,
 * which is fine for occasional updates but turns into a frame-rate killer
 * when forms / wizards / drag-and-drop fire many small updates back-to-back
 * (each one JSON.stringifies the entire store and writes to disk).
 *
 * This wrapper batches writes — keeps the latest value per key in memory
 * and flushes once after `delayMs` of quiet, with a guaranteed flush on
 * `pagehide` / `beforeunload` so we never lose data the user just typed.
 *
 * Reads still go straight through so rehydration on mount is unaffected.
 */
function createDebouncedStorage(delayMs = 200): StateStorage {
  // SSR / build-time guard — return a no-op store the persist middleware can
  // still call without throwing during pre-render.
  const ls = typeof window !== "undefined" ? window.localStorage : null;
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (!ls) return;
    for (const [key, value] of pending) {
      try {
        ls.setItem(key, value);
      } catch {
        // quota / privacy mode — swallow so the UI doesn't crash
      }
    }
    pending.clear();
    timer = null;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  return {
    getItem(key) {
      // Honor still-pending writes so reads see the latest value.
      if (pending.has(key)) return pending.get(key) ?? null;
      return ls ? ls.getItem(key) : null;
    },
    setItem(key, value) {
      pending.set(key, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem(key) {
      pending.delete(key);
      if (ls) ls.removeItem(key);
    },
  };
}

/** Shared singleton — every store uses the same buffer + flush timer. */
export const debouncedLocalStorage = createJSONStorage(() =>
  createDebouncedStorage(200),
);
