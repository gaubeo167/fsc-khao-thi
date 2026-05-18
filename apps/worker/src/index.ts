import pino from "pino";

import { prisma, redis } from "@fsc/database";

import { startFlushLoop } from "./flush-loop";

const logger = pino({ name: "fsc-worker" });

const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS ?? 5000);

const stop = startFlushLoop({
  intervalMs: FLUSH_INTERVAL_MS,
  logger,
});

logger.info({ intervalMs: FLUSH_INTERVAL_MS }, "worker_started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker_shutting_down");
  try {
    await stop();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "worker_shutdown_failed");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
