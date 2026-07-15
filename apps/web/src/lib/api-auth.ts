import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebase-admin";

/**
 * Server-side auth guard for API routes.
 *
 * Verifies the `Authorization: Bearer <Firebase ID token>` header, loads
 * the caller's /users profile, and (optionally) requires a staff role.
 * Returns either `{ caller }` or `{ error: NextResponse }` — the route
 * does `if ("error" in r) return r.error;` at the top.
 *
 * Before this existed, /api/ai/* and /api/import/* were fully open →
 * anyone could POST and burn the server's LLM API budget or parse files.
 */

const STAFF_ROLES = new Set([
  "teacher",
  "subject-lead",
  "campus-admin",
  "academic-director",
  "superadmin",
]);

export interface AuthedCaller {
  uid: string;
  role: string;
  campusId: string | null;
  data: Record<string, unknown>;
}

export async function verifyCaller(
  req: Request,
  opts?: { staffOnly?: boolean },
): Promise<{ caller: AuthedCaller } | { error: NextResponse }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!idToken) {
    return {
      error: NextResponse.json(
        { error: "unauthorized", message: "Thiếu Authorization: Bearer <idToken>." },
        { status: 401 },
      ),
    };
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: "server", message: (e as Error).message },
        { status: 500 },
      ),
    };
  }

  let decoded: import("firebase-admin/auth").DecodedIdToken;
  try {
    decoded = await admin.auth.verifyIdToken(idToken);
  } catch {
    return {
      error: NextResponse.json(
        { error: "unauthorized", message: "ID token không hợp lệ." },
        { status: 401 },
      ),
    };
  }

  const snap = await admin.db.collection("users").doc(decoded.uid).get();
  if (!snap.exists) {
    return {
      error: NextResponse.json(
        { error: "forbidden", message: "Không tìm thấy hồ sơ người dùng." },
        { status: 403 },
      ),
    };
  }
  const data = snap.data() ?? {};
  const role = (data.role ?? "") as string;

  if (opts?.staffOnly && !STAFF_ROLES.has(role)) {
    return {
      error: NextResponse.json(
        { error: "forbidden", message: `Vai trò "${role}" không có quyền dùng chức năng này.` },
        { status: 403 },
      ),
    };
  }

  return {
    caller: {
      uid: decoded.uid,
      role,
      campusId: (data.campusId ?? null) as string | null,
      data,
    },
  };
}
