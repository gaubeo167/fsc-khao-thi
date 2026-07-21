import type { NextConfig } from "next";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3001";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@fsc/shared"],
  async rewrites() {
    // Proxy ONLY the Fastify exam-attempt backend. A broad `/api/:path*`
    // rewrite (afterFiles) runs BEFORE dynamic route handlers, so it was
    // shadowing our own dynamic API routes (/api/exam/[shiftId]/*,
    // /api/homework/[id]/*) → they returned 404. Scope it tightly.
    return [
      {
        source: "/api/attempts/:path*",
        destination: `${API_ORIGIN}/api/attempts/:path*`,
      },
    ];
  },
};

export default config;
