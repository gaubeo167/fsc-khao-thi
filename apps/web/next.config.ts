import type { NextConfig } from "next";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3001";

const config: NextConfig = {
  // Thư mục kết xuất. `next dev` và `next build` mặc định dùng CHUNG `.next`,
  // nên build trong lúc dev server đang chạy sẽ ghi đè thư mục nó đang phục
  // vụ — dev server sống sót nhưng trả 500 cho mọi trang, và không có gì báo
  // vì sao. Đó là lý do CLAUDE.md từng phải dặn "đừng build khi đang dev".
  //
  // Đặt NEXT_DIST_DIR để build sang chỗ khác là hai bên không đụng nhau nữa:
  //     NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
