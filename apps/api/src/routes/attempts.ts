import type { FastifyInstance } from "fastify";

import {
  AttemptIdParamSchema,
  SaveAttemptRequestSchema,
  StartAttemptRequestSchema,
  SubmitAttemptRequestSchema,
} from "@fsc/shared";

import {
  getAttempt,
  saveResponse,
  startAttempt,
  submitAttempt,
} from "../services/attempt-service";

export async function attemptRoutes(app: FastifyInstance): Promise<void> {
  app.post("/attempts", async (request, reply) => {
    const body = StartAttemptRequestSchema.parse(request.body);
    const attempt = await startAttempt(body);
    reply.status(201).send({ success: true, attempt });
  });

  app.get("/attempts/:id", async (request) => {
    const { id } = AttemptIdParamSchema.parse(request.params);
    const attempt = await getAttempt(id);
    return { success: true, attempt };
  });

  app.post("/attempts/:id/save", async (request) => {
    const { id } = AttemptIdParamSchema.parse(request.params);
    const body = SaveAttemptRequestSchema.parse(request.body);
    await saveResponse(id, body);
    return { success: true, cached: true, storage: "redis" } as const;
  });

  app.post("/attempts/:id/submit", async (request) => {
    const { id } = AttemptIdParamSchema.parse(request.params);
    SubmitAttemptRequestSchema.parse(request.body ?? {});
    const attempt = await submitAttempt(id);
    return { success: true, attempt };
  });
}
