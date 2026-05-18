import {
  AttemptDetailResponseSchema,
  AttemptResponseSchema,
  type AttemptDetailResponse,
  type AttemptResponse,
  type SaveAttemptRequest,
  type StartAttemptRequest,
} from "@fsc/shared";
import { z } from "zod";

import { apiFetch } from "@/lib/api-client";

const StartResponseSchema = z.object({
  success: z.literal(true),
  attempt: AttemptResponseSchema,
});

const GetResponseSchema = z.object({
  success: z.literal(true),
  attempt: AttemptDetailResponseSchema,
});

const SaveResponseSchema = z.object({
  success: z.literal(true),
  cached: z.literal(true),
  storage: z.literal("redis"),
});

const SubmitResponseSchema = z.object({
  success: z.literal(true),
  attempt: AttemptResponseSchema,
});

export async function startAttempt(input: StartAttemptRequest): Promise<AttemptResponse> {
  const data = await apiFetch<unknown>("/api/attempts", { method: "POST", body: input });
  return StartResponseSchema.parse(data).attempt;
}

export async function fetchAttempt(attemptId: string): Promise<AttemptDetailResponse> {
  const data = await apiFetch<unknown>(`/api/attempts/${attemptId}`);
  return GetResponseSchema.parse(data).attempt;
}

export async function saveResponse(
  attemptId: string,
  input: SaveAttemptRequest,
  opts: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const data = await apiFetch<unknown>(`/api/attempts/${attemptId}/save`, {
    method: "POST",
    body: input,
    keepalive: opts.keepalive,
    signal: opts.signal,
  });
  SaveResponseSchema.parse(data);
}

export async function submitAttempt(attemptId: string): Promise<AttemptResponse> {
  const data = await apiFetch<unknown>(`/api/attempts/${attemptId}/submit`, {
    method: "POST",
    body: {},
  });
  return SubmitResponseSchema.parse(data).attempt;
}
