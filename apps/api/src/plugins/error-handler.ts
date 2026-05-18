import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { DomainError } from "../services/errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "validation_error",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
          message: i.message,
        })),
      });
      return;
    }

    if (error instanceof DomainError) {
      reply.status(error.statusCode).send({ error: error.code });
      return;
    }

    request.log.error({ err: error }, "unhandled_error");
    reply.status(500).send({ error: "internal_error" });
  });
}
