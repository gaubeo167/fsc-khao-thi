import { PrismaClient } from "@prisma/client";

declare global {
  var __fscPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__fscPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__fscPrisma = prisma;
}
