import type { Attempt, Response as ResponseRow } from "@prisma/client";

import {
  AttemptStatus,
  REDIS_KEYS,
  type AttemptDetailResponse,
  type AttemptResponse,
  type ResponseDto,
  type SaveAttemptRequest,
  type StartAttemptRequest,
} from "@fsc/shared";
import { flushAttempt, prisma, redis } from "@fsc/database";

import { AttemptLocked, AttemptNotFound } from "./errors";

type AttemptWithResponses = Attempt & { responses: ResponseRow[] };

function toDto(attempt: Attempt): AttemptResponse {
  return {
    id: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    status: attempt.status as AttemptResponse["status"],
    durationMs: attempt.durationMs,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

function isTimeExpired(attempt: Attempt, now = Date.now()): boolean {
  return now - attempt.startedAt.getTime() >= attempt.durationMs;
}

function computeRemaining(attempt: Attempt, now = Date.now()): number {
  if (attempt.status !== AttemptStatus.IN_PROGRESS) return 0;
  return Math.max(0, attempt.durationMs - (now - attempt.startedAt.getTime()));
}

/**
 * Terminal transition: flushes Redis buffer to Postgres, sets status,
 * stamps submittedAt for submissions, and clears the hot buffer.
 *
 * Used by both submit (SUBMITTED) and auto-expire (EXPIRED).
 */
async function finalizeAttempt(
  attemptId: string,
  status: typeof AttemptStatus.SUBMITTED | typeof AttemptStatus.EXPIRED,
): Promise<Attempt> {
  await flushAttempt(attemptId);
  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status,
      ...(status === AttemptStatus.SUBMITTED ? { submittedAt: new Date() } : {}),
    },
  });
  await redis.del(REDIS_KEYS.attemptResponses(attemptId));
  return updated;
}

/**
 * Loads the attempt and, if its clock has run out while still IN_PROGRESS,
 * transitions it to EXPIRED before returning. Callers never see a stale
 * in-progress row past its deadline.
 */
async function loadAuthoritative(attemptId: string): Promise<AttemptWithResponses> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { responses: true },
  });
  if (!attempt) throw AttemptNotFound();

  if (attempt.status === AttemptStatus.IN_PROGRESS && isTimeExpired(attempt)) {
    await finalizeAttempt(attemptId, AttemptStatus.EXPIRED);
    const refreshed = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { responses: true },
    });
    if (!refreshed) throw AttemptNotFound();
    return refreshed;
  }

  return attempt;
}

export async function startAttempt(
  input: StartAttemptRequest,
): Promise<AttemptResponse> {
  const attempt = await prisma.attempt.create({
    data: {
      examId: input.examId,
      studentId: input.studentId,
      durationMs: input.durationMs,
      status: AttemptStatus.IN_PROGRESS,
    },
  });

  return toDto(attempt);
}

export async function saveResponse(
  attemptId: string,
  input: SaveAttemptRequest,
): Promise<void> {
  const attempt = await loadAuthoritative(attemptId);

  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw AttemptLocked();
  }

  const pipeline = redis.multi();
  pipeline.hset(REDIS_KEYS.attemptResponses(attemptId), input.questionId, input.payload);
  pipeline.sadd(REDIS_KEYS.dirtyAttempts, attemptId);
  await pipeline.exec();
}

export async function submitAttempt(attemptId: string): Promise<AttemptResponse> {
  const attempt = await loadAuthoritative(attemptId);

  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw AttemptLocked();
  }

  const finalized = await finalizeAttempt(attemptId, AttemptStatus.SUBMITTED);
  return toDto(finalized);
}

export async function getAttempt(attemptId: string): Promise<AttemptDetailResponse> {
  const attempt = await loadAuthoritative(attemptId);

  // Read the hot buffer only while the attempt is active; finalized
  // attempts have already had their hash deleted by finalizeAttempt.
  const hotBuffer =
    attempt.status === AttemptStatus.IN_PROGRESS
      ? await redis.hgetall(REDIS_KEYS.attemptResponses(attemptId))
      : {};

  const merged = new Map<string, string>();
  for (const row of attempt.responses) {
    merged.set(row.questionId, row.payload);
  }
  // Redis hot buffer overrides persisted rows for in-flight edits.
  for (const [questionId, payload] of Object.entries(hotBuffer)) {
    merged.set(questionId, payload);
  }

  const responses: ResponseDto[] = Array.from(merged, ([questionId, payload]) => ({
    questionId,
    payload,
  }));

  return {
    ...toDto(attempt),
    remainingTimeMs: computeRemaining(attempt),
    responses,
  };
}
