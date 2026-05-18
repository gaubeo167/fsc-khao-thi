import { z } from "zod";

import { AttemptStatusSchema } from "../enums/attempt-status";
import { CuidSchema } from "./common";

export const StartAttemptRequestSchema = z.object({
  examId: z.string().min(1).max(128),
  studentId: z.string().min(1).max(128),
  durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
});
export type StartAttemptRequest = z.infer<typeof StartAttemptRequestSchema>;

export const SaveAttemptRequestSchema = z.object({
  questionId: z.string().min(1).max(128),
  payload: z.string().max(64 * 1024),
});
export type SaveAttemptRequest = z.infer<typeof SaveAttemptRequestSchema>;

export const SubmitAttemptRequestSchema = z.object({}).strict();
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>;

export const AttemptResponseSchema = z.object({
  id: CuidSchema,
  examId: z.string(),
  studentId: z.string(),
  status: AttemptStatusSchema,
  durationMs: z.number().int().positive(),
  startedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

export const ResponseDtoSchema = z.object({
  questionId: z.string(),
  payload: z.string(),
});
export type ResponseDto = z.infer<typeof ResponseDtoSchema>;

export const AttemptDetailResponseSchema = AttemptResponseSchema.extend({
  remainingTimeMs: z.number().int().nonnegative(),
  responses: z.array(ResponseDtoSchema),
});
export type AttemptDetailResponse = z.infer<typeof AttemptDetailResponseSchema>;

export const GetAttemptResponseSchema = z.object({
  success: z.literal(true),
  attempt: AttemptDetailResponseSchema,
});
export type GetAttemptResponseDto = z.infer<typeof GetAttemptResponseSchema>;

export const SaveAttemptResponseSchema = z.object({
  success: z.literal(true),
  cached: z.literal(true),
  storage: z.literal("redis"),
});
export type SaveAttemptResponseDto = z.infer<typeof SaveAttemptResponseSchema>;

export const SubmitAttemptResponseSchema = z.object({
  success: z.literal(true),
  attempt: AttemptResponseSchema,
});
export type SubmitAttemptResponseDto = z.infer<typeof SubmitAttemptResponseSchema>;
