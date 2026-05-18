"use client";

import type { ReactNode } from "react";

import { ScopeContext, useResolveScope } from "./use-scope";

/**
 * Computes the user scope once at the authenticated-layout root and
 * pipes it down via context. Every page that calls `useUserScope()`
 * then reads from this context instead of resubscribing to the users
 * / subjects / auth stores — eliminating O(N) duplicate Zustand
 * listeners and the matching useMemo recomputations.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const scope = useResolveScope();
  return (
    <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
  );
}
