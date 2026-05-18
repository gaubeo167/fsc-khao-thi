import Redis from "ioredis";

const url = process.env.REDIS_URL;

export const redis: Redis = url
  ? new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false })
  : new Redis({
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 3,
    });
