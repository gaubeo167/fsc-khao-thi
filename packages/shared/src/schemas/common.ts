import { z } from "zod";

export const CuidSchema = z.string().min(1).max(64);

export const AttemptIdParamSchema = z.object({
  id: CuidSchema,
});

export type AttemptIdParam = z.infer<typeof AttemptIdParamSchema>;
