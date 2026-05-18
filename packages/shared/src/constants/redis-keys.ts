export const REDIS_KEYS = {
  attemptResponses: (attemptId: string) => `attempt:${attemptId}:responses`,
  dirtyAttempts: "dirty_attempts",
} as const;
