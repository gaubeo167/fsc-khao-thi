import { z } from "zod";

const ClientEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:3001"),
});

export const env = ClientEnvSchema.parse({
  NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN,
});
