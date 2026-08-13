"use client";

/**
 * Firebase Auth wrapper — abstracts the SDK so the rest of the app talks
 * to plain promises and never imports `firebase/auth` directly.
 *
 * The session shape (`AuthSession`) mirrors what the localStorage-era
 * auth store exposed, so consumers don't need to change.
 *
 * Profile fields (role, campusId, name, …) live in /users/{uid} —
 * Firebase Auth itself only stores email + uid. After every sign-in
 * we hydrate the profile doc into the session.
 */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FbUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { getAuthSafe, getDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";

import type { AuthSession, Role } from "../state/auth-store";

/**
 * Chuẩn hoá một định danh đăng nhập (username / mã HS) thành khoá tra cứu.
 * Doc id Firestore không nhận "/" và phân biệt hoa thường, nên hạ chữ và
 * thay ký tự cấm.
 */
export function loginLookupKey(identifier: string): string {
  return identifier.trim().toLowerCase().replace(/[/#?\[\]]/g, "_");
}

/**
 * Đổi định danh gõ vào (username / mã HS) → email Firebase Auth.
 *
 * Tra trong /login_lookup — bảng CHỈ chứa { email }. Trước đây hàm này query
 * thẳng /users, buộc /users phải mở `allow read: if true`, khiến bất kỳ ai
 * trên internet tải được họ tên học sinh, lớp, mã HS và email/SĐT phụ huynh
 * bằng REST API (web API key vốn nằm công khai trong bundle). Bảng tra cứu
 * riêng giữ được luồng đăng nhập trước-khi-xác-thực mà không lộ hồ sơ.
 *
 * Chỉ chạy khi email tổng hợp `{username}@students.fsc.local` không tồn tại
 * (tài khoản cũ). Trả email đầu tiên tìm được, hoặc null.
 */
export async function resolveLoginEmail(
  identifier: string,
): Promise<string | null> {
  const key = loginLookupKey(identifier);
  if (!key) return null;
  try {
    const snap = await getDoc(doc(getDb(), COLLECTIONS.loginLookup, key));
    const email = (snap.data() as { email?: string } | undefined)?.email;
    return typeof email === "string" && email ? email : null;
  } catch {
    return null;
  }
}

/** Doc shape stored at /users/{uid} — Firestore schema, NOT the Zustand store shape. */
export interface UserProfileDoc {
  id: string;
  email: string;
  name: string;
  role: Role;
  campusId: string | null;
  status: "active" | "suspended";
  subject?: string | null;
  className?: string | null;
  subjectIds?: string[];
  gradeIds?: string[];
  classIds?: string[];
  permissions?: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
}

export type SignInOutcome =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: "not_found" | "invalid_password" | "suspended" | "network" };

/**
 * Sign in with email + password against Firebase Auth, then load the
 * profile doc from Firestore. Returns a tagged result so the UI can
 * differentiate "wrong password" from "account suspended" etc.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SignInOutcome> {
  const auth = getAuthSafe();
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const session = await hydrateSession(cred.user);
    if (!session) return { ok: false, reason: "not_found" };
    if (session.status === "suspended") {
      await fbSignOut(auth);
      return { ok: false, reason: "suspended" };
    }
    return { ok: true, session: session.session };
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (
      code === "auth/user-not-found" ||
      code === "auth/invalid-email" ||
      code === "auth/invalid-credential"
    ) {
      // Firebase v9+ collapsed "wrong password" into "invalid-credential" to
      // prevent enumeration — we surface it as a generic "invalid_password".
      return { ok: false, reason: "invalid_password" };
    }
    if (code === "auth/wrong-password") {
      return { ok: false, reason: "invalid_password" };
    }
    if (code === "auth/user-disabled") {
      return { ok: false, reason: "suspended" };
    }
    if (code === "auth/network-request-failed") {
      return { ok: false, reason: "network" };
    }
    return { ok: false, reason: "invalid_password" };
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(getAuthSafe());
}

/** Resolve the /users/{uid} doc + project to the session shape. */
async function hydrateSession(
  fb: FbUser,
): Promise<{ session: AuthSession; status: UserProfileDoc["status"] } | null> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, fb.uid));
  if (!snap.exists()) return null;
  const data = snap.data() as UserProfileDoc;
  const session: AuthSession = {
    userId: fb.uid,
    email: data.email,
    name: data.name,
    role: data.role,
    campusId: data.campusId,
    studentId: fb.uid,
    signedInAt: Date.now(),
  };
  return { session, status: data.status };
}

/**
 * Subscribe to Firebase Auth state changes. Fires once on mount with the
 * current state (signed in or not), then on every sign-in / sign-out.
 *
 * Returns the unsubscribe function. Use this from a single mount point
 * (e.g., the authenticated layout) so the listener is set up once.
 */
export function subscribeAuth(
  onChange: (session: AuthSession | null) => void,
): () => void {
  const auth = getAuthSafe();
  return onAuthStateChanged(auth, async (fb) => {
    if (!fb) {
      onChange(null);
      return;
    }
    const result = await hydrateSession(fb);
    if (!result || result.status === "suspended") {
      // Profile missing or disabled — sign them out so the layout redirects.
      await fbSignOut(auth);
      onChange(null);
      return;
    }
    onChange(result.session);
  });
}
