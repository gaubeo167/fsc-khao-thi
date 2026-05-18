"use client";

import { useQueries, type UseQueryOptions } from "@tanstack/react-query";
import type { AttemptDetailResponse } from "@fsc/shared";
import { useMemo } from "react";

import { attemptKeys } from "@/features/attempts/api/hooks";
import { fetchAttempt } from "@/features/attempts/api/attempts-api";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { ApiError } from "@/lib/api-client";

export interface MyAttemptItem {
  id: string;
  status: "loading" | "found" | "missing" | "error";
  attempt: AttemptDetailResponse | null;
  error: ApiError | null;
}

/**
 * Until the backend exposes a "list my attempts" endpoint, we keep the
 * list locally (auth-store.recentAttemptIds) and re-fetch each detail.
 * Missing (404) attempts are silently surfaced and can be evicted.
 */
export function useMyAttempts(): {
  items: MyAttemptItem[];
  inProgress: MyAttemptItem[];
  finished: MyAttemptItem[];
} {
  const ids = useAuthStore((s) => s.recentAttemptIds);

  const queries = useQueries({
    queries: ids.map<
      UseQueryOptions<AttemptDetailResponse, ApiError, AttemptDetailResponse, readonly ["attempt", string]>
    >((id) => ({
      queryKey: attemptKeys.detail(id),
      queryFn: () => fetchAttempt(id),
      staleTime: 30_000,
      retry: (failureCount, error) => (error.status === 404 ? false : failureCount < 1),
    })),
  });

  return useMemo(() => {
    const items: MyAttemptItem[] = ids.map((id, i) => {
      const q = queries[i];
      if (q.isPending) {
        return { id, status: "loading", attempt: null, error: null };
      }
      if (q.error) {
        const apiErr = q.error instanceof ApiError ? q.error : null;
        if (apiErr?.status === 404) {
          return { id, status: "missing", attempt: null, error: apiErr };
        }
        return { id, status: "error", attempt: null, error: apiErr };
      }
      return { id, status: "found", attempt: q.data ?? null, error: null };
    });

    const inProgress = items.filter(
      (it) => it.attempt && it.attempt.status === "IN_PROGRESS",
    );
    const finished = items.filter(
      (it) =>
        it.attempt &&
        (it.attempt.status === "SUBMITTED" || it.attempt.status === "EXPIRED"),
    );

    return { items, inProgress, finished };
    // queries reference is stable enough; rely on ids + each query state for memo invalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, ...queries.map((q) => `${q.status}:${q.dataUpdatedAt}:${q.errorUpdatedAt}`)]);
}
