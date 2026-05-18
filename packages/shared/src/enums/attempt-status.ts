import { z } from "zod";

export const AttemptStatus = {
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  EXPIRED: "EXPIRED",
} as const;

export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const AttemptStatusSchema = z.enum([
  AttemptStatus.IN_PROGRESS,
  AttemptStatus.SUBMITTED,
  AttemptStatus.EXPIRED,
]);
