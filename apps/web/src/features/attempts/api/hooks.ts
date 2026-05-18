"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type {
  AttemptDetailResponse,
  AttemptResponse,
  SaveAttemptRequest,
  StartAttemptRequest,
} from "@fsc/shared";

import { ApiError } from "@/lib/api-client";

import {
  fetchAttempt,
  saveResponse,
  startAttempt,
  submitAttempt,
} from "./attempts-api";

export const attemptKeys = {
  detail: (id: string) => ["attempt", id] as const,
};

export function useAttempt(
  attemptId: string,
  options?: Omit<
    UseQueryOptions<AttemptDetailResponse, ApiError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<AttemptDetailResponse, ApiError>({
    queryKey: attemptKeys.detail(attemptId),
    queryFn: () => fetchAttempt(attemptId),
    // Active exam: keep authoritative — refetch on focus so the timer
    // can resync after sleep/wake. Submitted attempts never change again.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) =>
      error.status === 404 ? false : failureCount < 2,
    ...options,
  });
}

export function useStartAttempt() {
  const qc = useQueryClient();
  return useMutation<AttemptResponse, Error, StartAttemptRequest>({
    mutationFn: startAttempt,
    onSuccess: (attempt) => {
      const seed: AttemptDetailResponse = {
        ...attempt,
        remainingTimeMs: attempt.durationMs,
        responses: [],
      };
      qc.setQueryData(attemptKeys.detail(attempt.id), seed);
    },
  });
}

export interface SaveResponseVars {
  attemptId: string;
  payload: SaveAttemptRequest;
  keepalive?: boolean;
}

export function useSaveResponse() {
  return useMutation<void, Error, SaveResponseVars>({
    mutationFn: ({ attemptId, payload, keepalive }) =>
      saveResponse(attemptId, payload, { keepalive }),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation<AttemptResponse, Error, string>({
    mutationFn: submitAttempt,
    onSuccess: (attempt) => {
      // Re-fetch detail so locked-state view has full payload.
      qc.invalidateQueries({ queryKey: attemptKeys.detail(attempt.id) });
    },
  });
}
