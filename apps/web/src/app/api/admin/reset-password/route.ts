/**
 * POST /api/admin/reset-password
 *
 * Body: { targetUserId: string, newPassword: string }
 *
 * Auth: caller must send `Authorization: Bearer <Firebase ID token>` of a
 *       signed-in user whose /users/{uid}.role is superadmin | academic-director
 *       | campus-admin. Campus admins may only reset users inside their own
 *       campus(es).
 *
 * Effect: calls Admin SDK `auth().updateUser(targetUid, { password })` so
 *         the user can actually log in with the new password (the previous
 *         implementation only sent a reset email, which never worked for
 *         students using synthetic emails).
 */

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebase-admin";

const STAFF_ROLES_THAT_CAN_RESET = new Set([
  "superadmin",
  "academic-director",
  "campus-admin",
]);

export async function POST(req: Request) {
  let body: { targetUserId?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { targetUserId, newPassword } = body;
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json(
      { error: "targetUserId required" },
      { status: 400 },
    );
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return NextResponse.json(
      { error: "newPassword must be ≥ 6 characters" },
      { status: 400 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!idToken) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <idToken>" },
      { status: 401 },
    );
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  let decoded: import("firebase-admin/auth").DecodedIdToken;
  try {
    decoded = await admin.auth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid ID token" }, { status: 401 });
  }

  const callerSnap = await admin.db
    .collection("users")
    .doc(decoded.uid)
    .get();
  if (!callerSnap.exists) {
    return NextResponse.json(
      { error: "Caller profile not found" },
      { status: 403 },
    );
  }
  const callerData = callerSnap.data() ?? {};
  const callerRole = (callerData.role ?? "") as string;
  if (!STAFF_ROLES_THAT_CAN_RESET.has(callerRole)) {
    return NextResponse.json(
      { error: `Role "${callerRole}" cannot reset passwords` },
      { status: 403 },
    );
  }

  const targetSnap = await admin.db
    .collection("users")
    .doc(targetUserId)
    .get();
  if (!targetSnap.exists) {
    return NextResponse.json(
      { error: "Target user not found" },
      { status: 404 },
    );
  }
  const targetData = targetSnap.data() ?? {};

  // Campus admin scope check.
  if (callerRole === "campus-admin") {
    const callerCampuses: string[] = Array.isArray(callerData.campusIds)
      ? callerData.campusIds
      : [];
    const targetCampuses: string[] = Array.isArray(targetData.campusIds)
      ? targetData.campusIds
      : targetData.campusId
        ? [targetData.campusId]
        : [];
    const overlap = targetCampuses.some((c) => callerCampuses.includes(c));
    if (!overlap) {
      return NextResponse.json(
        { error: "Campus admins can only reset users in their own campus" },
        { status: 403 },
      );
    }
    if (targetData.role === "superadmin") {
      return NextResponse.json(
        { error: "Cannot reset superadmin password from campus-admin role" },
        { status: 403 },
      );
    }
  }

  // Resolve the Firebase Auth user. Students log in with synthetic emails
  // (`{username}@students.fsc.local`), staff with their real email. The
  // /users mirror stores `email` either way, so look up by email.
  const targetEmail = (targetData.email ?? "") as string;
  if (!targetEmail) {
    return NextResponse.json(
      { error: "Target user has no email field — cannot resolve Auth account" },
      { status: 422 },
    );
  }

  let authUser: import("firebase-admin/auth").UserRecord;
  try {
    authUser = await admin.auth.getUserByEmail(targetEmail);
  } catch {
    // Create the auth user if it doesn't exist yet (legacy profiles).
    try {
      authUser = await admin.auth.createUser({
        uid: targetUserId,
        email: targetEmail,
        password: newPassword,
      });
      return NextResponse.json({ ok: true, created: true, uid: authUser.uid });
    } catch (createErr) {
      return NextResponse.json(
        { error: `Could not create Auth user: ${(createErr as Error).message}` },
        { status: 500 },
      );
    }
  }

  try {
    await admin.auth.updateUser(authUser.uid, { password: newPassword });
  } catch (err) {
    return NextResponse.json(
      { error: `updateUser failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, uid: authUser.uid });
}
