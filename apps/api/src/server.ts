import Fastify from "fastify";

import { prisma, redis } from "@fsc/database";

import { registerErrorHandler } from "./plugins/error-handler";
import { attemptRoutes } from "./routes/attempts";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({ logger: true });

registerErrorHandler(app);

app.get("/healthz", async () => ({ status: "ok" }));

app.register(attemptRoutes, { prefix: "/api" });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting_down");
  try {
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "shutdown_failed");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}

async function main(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error({ err }, "startup_failed");
    process.exit(1);
  }
}

void main();
