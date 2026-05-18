import { REDIS_KEYS } from "@fsc/shared";

import { prisma } from "../prisma";
import { redis } from "../redis";

export interface FlushAttemptResult {
  attemptId: string;
  responsesFlushed: number;
}

/**
 * Drains the Redis buffer for an attempt into Postgres.
 *
 * Used by both the API submit handler and the worker loop, so it MUST be
 * idempotent: re-running it with no buffered responses is a no-op.
 *
 * Responses are upserted in a single transaction so a partial failure
 * leaves the dirty-set entry intact and the next pass retries.
 */
export async function flushAttempt(attemptId: string): Promise<FlushAttemptResult> {
  const responsesKey = REDIS_KEYS.attemptResponses(attemptId);
  const buffered = await redis.hgetall(responsesKey);

  const questionIds = Object.keys(buffered);

  if (questionIds.length > 0) {
    await prisma.$transaction(
      questionIds.map((questionId) =>
        prisma.response.upsert({
          where: {
            attemptId_questionId: { attemptId, questionId },
          },
          update: { payload: buffered[questionId] },
          create: { attemptId, questionId, payload: buffered[questionId] },
        }),
      ),
    );
  }

  await redis.srem(REDIS_KEYS.dirtyAttempts, attemptId);

  return { attemptId, responsesFlushed: questionIds.length };
}
