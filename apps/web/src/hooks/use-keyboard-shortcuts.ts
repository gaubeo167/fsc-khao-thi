"use client";

import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

export function useKeyboardShortcuts(handlers: Record<string, Handler>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const handler = handlers[e.key];
      if (handler) handler(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
