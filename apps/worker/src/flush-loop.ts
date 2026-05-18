import type { Logger } from "pino";

import { flushAttempt, redis } from "@fsc/database";
import { REDIS_KEYS } from "@fsc/shared";

export interface FlushLoopOptions {
  intervalMs: number;
  logger: Logger;
}

/**
 * Polls the dirty-attempts set and flushes each attempt's buffered responses
 * into Postgres. Each cycle is serialized with a guard so a slow flush never
 * overlaps itself.
 */
export function startFlushLoop(opts: FlushLoopOptions): () => Promise<void> {
  const { intervalMs, logger } = opts;
  let running = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      const ids = await redis.smembers(REDIS_KEYS.dirtyAttempts);
      for (const id of ids) {
        if (stopped) break;
        try {
          const result = await flushAttempt(id);
          if (result.responsesFlushed > 0) {
            logger.info(
              { attemptId: id, count: result.responsesFlushed },
              "flushed_attempt",
            );
          }
        } catch (err) {
          logger.error({ err, attemptId: id }, "flush_attempt_failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "flush_tick_failed");
    } finally {
      running = false;
    }
  }

  const handle = setInterval(() => void tick(), intervalMs);

  return async function stop(): Promise<void> {
    stopped = true;
    clearInterval(handle);
    while (running) {
      await new Promise((r) => setTimeout(r, 50));
    }
  };
}
