"use client";

import { useLayoutEffect } from "react";

import { healDataOnce } from "@/lib/data-heal";

/**
 * Mount once at the root; runs `healDataOnce()` *before* the first paint
 * so Zustand stores haven't yet read stale localStorage. If the heal
 * mutated anything, force a single reload so all persist-rehydrate
 * cycles pick up the cleaned data.
 *
 * Once the one-shot flag is set in localStorage this component is a
 * no-op on subsequent sessions.
 */
export function DataHealer() {
  useLayoutEffect(() => {
    if (healDataOnce()) {
      window.location.reload();
    }
  }, []);
  return null;
}
