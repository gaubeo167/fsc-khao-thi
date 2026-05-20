"use client";

import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { create } from "zustand";

import {
  SEED_USERS,
  type SeedUser,
} from "@/features/auth/data/seed-users";
import type { Role } from "@/features/auth/state/auth-store";
import { getAuthSafe, getDb, isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { sanitizeForFirestore } from "@/lib/firestore-sync";

export interface CreateUserInput {
  name: string;
  /** For staff: required. For students: optional (contact only). */
  email?: string;
  role: Role;
  campusId: string | null;
  subject?: string;
  className?: string;
  subjectIds?: string[];
  gradeIds?: string[];
  classIds?: string[];
  permissions?: SeedUser["permissions"];
  password: string;
  status?: SeedUser["status"];
  // Student profile
  studentCode?: string;
  username?: string;
  parentPhone?: string;
  parentEmail?: string;
}

export interface UpdateUserPatch {
  name?: string;
  email?: string;
  role?: Role;
  campusId?: string | null;
  subject?: string | null;
  className?: string | null;
  subjectIds?: string[];
  gradeIds?: string[];
  classIds?: string[];
  permissions?: SeedUser["permissions"];
  /** Ignored — passwords are managed by Firebase Auth, not stored in Firestore. */
  password?: string;
  status?: SeedUser["status"];
  studentCode?: string | null;
  username?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
}

interface UsersState {
  users: SeedUser[];
  /** `true` once the first Firestore snapshot arrived. */
  hydrated: boolean;
}

interface UsersActions {
  /**
   * Create a Firebase Auth account + matching /users/{uid} doc. Uses a
   * SECONDARY app instance to avoid replacing the admin's current
   * session with the new user's session.
   *
   * Returns the new SeedUser projection (with `id = firebase uid`).
   */
  create(input: CreateUserInput): Promise<SeedUser>;
  /** Update profile fields in /users/{uid}. `password` is ignored — use `resetPassword()`. */
  update(id: string, patch: UpdateUserPatch): Promise<SeedUser | null>;
  /** Delete the Firestore profile doc. The Firebase Auth user remains —
   *  admin must disable / delete them from the Firebase Console. */
  remove(id: string): Promise<void>;
  setStatus(id: string, status: SeedUser["status"]): Promise<void>;
  /**
   * Send a password-reset email via Firebase Auth. Admin can't directly
   * choose another user's password from the client SDK — this is the
   * documented workaround.
   */
  resetPassword(id: string, newPasswordIgnored?: string): Promise<void>;

  findById(id: string): SeedUser | undefined;
  findByIdentifier(identifier: string): SeedUser | undefined;
  /** @deprecated authentication moved to Firebase Auth — login form does
   *  the credential check directly. Always returns null. */
  validateCredentials(identifier: string, password: string): SeedUser | null;

  _applySnapshot(users: SeedUser[]): void;
}

// Only fall back to seed users when Firebase isn't configured — in
// production we wait for the snapshot to avoid the "deleted account
// reappears for ~1s on every page load" flash.
const INITIAL_USERS = isFirebaseConfigured() ? [] : SEED_USERS;

export const useUsersStore = create<UsersState & UsersActions>()((set, get) => ({
  users: INITIAL_USERS,
  hydrated: false,

  async create(input) {
    // For students, resolve username + login email up-front so both
    // demo-mode and Firebase-mode paths see the same generated values.
    const resolved = resolveStudentAccount(input, get().users);
    // Demo / offline mode: write to local Zustand only. Admins can still
    // create accounts that work in the seed-mode signin (auth-store
    // looks up the local users array when Firebase isn't configured).
    if (!isFirebaseConfigured()) {
      const now = new Date().toISOString();
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const u = {
        id,
        email: resolved.loginEmail,
        password: input.password,
        name: input.name.trim(),
        role: input.role,
        campusId: input.campusId,
        subject: input.subject,
        className: input.className,
        subjectIds: input.subjectIds,
        gradeIds: input.gradeIds,
        classIds: input.classIds,
        permissions: input.permissions,
        status: input.status ?? "active",
        studentCode: resolved.studentCode,
        username: resolved.username,
        // For students, the synthetic email IS the Firebase Auth
        // identity. Admin's typed `input.email` becomes the contact
        // email used for password-reset / notifications.
        contactEmail:
          input.role === "student" && input.email?.trim()
            ? input.email.trim().toLowerCase()
            : undefined,
        parentPhone: input.parentPhone,
        parentEmail: input.parentEmail,
        createdAt: now,
      } as SeedUser;
      set({ users: [u, ...get().users] });
      return u;
    }

    const cfg = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    };
    // Secondary app so creating a user doesn't replace the admin's session.
    const secondary = initializeApp(cfg, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondary);
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        resolved.loginEmail,
        input.password,
      );
      const uid = cred.user.uid;
      const now = new Date().toISOString();
      const profile: Omit<SeedUser, "password"> & {
        createdAt: string;
        updatedAt: ReturnType<typeof serverTimestamp>;
      } = {
        id: uid,
        email: resolved.loginEmail,
        name: input.name.trim(),
        role: input.role,
        campusId: input.campusId,
        subject: input.subject,
        className: input.className,
        subjectIds: input.subjectIds,
        gradeIds: input.gradeIds,
        classIds: input.classIds,
        permissions: input.permissions,
        status: input.status ?? "active",
        studentCode: resolved.studentCode,
        username: resolved.username,
        // For students, the synthetic email IS the Firebase Auth
        // identity. Admin's typed `input.email` becomes the contact
        // email used for password-reset / notifications.
        contactEmail:
          input.role === "student" && input.email?.trim()
            ? input.email.trim().toLowerCase()
            : undefined,
        parentPhone: input.parentPhone,
        parentEmail: input.parentEmail,
        createdAt: now,
        updatedAt: serverTimestamp(),
      };
      // Strip undefined fields — Firestore SDK throws on them. Common
      // case: caller (campus dialog) only sets a subset of optional
      // fields (`subject`, `className`, `subjectIds`, …).
      await setDoc(
        doc(getDb(), COLLECTIONS.users, uid),
        sanitizeForFirestore(profile as unknown as Record<string, unknown>),
      );
      // Sign out from secondary so it doesn't keep a stale session locally.
      await fbSignOut(secondaryAuth);
      // Return the SeedUser-shaped projection callers expect. Password is
      // managed by Firebase Auth — we return empty string for type compat.
      return { ...profile, password: "" } as SeedUser;
    } finally {
      await deleteApp(secondary).catch(() => {
        /* secondary app teardown can race — safe to ignore */
      });
    }
  },

  async update(id, patch) {
    // Optimistic local update — same shape regardless of Firebase mode.
    set({
      users: get().users.map((u) => {
        if (u.id !== id) return u;
        const next = { ...u };
        for (const [k, v] of Object.entries(patch)) {
          if (k === "password") {
            if (v) next.password = v as string;
            continue;
          }
          if (v === undefined) continue;
          (next as Record<string, unknown>)[k] = v === null ? null : v;
        }
        return next;
      }),
    });
    if (!isFirebaseConfigured()) {
      return get().users.find((u) => u.id === id) ?? null;
    }
    const ref = doc(getDb(), COLLECTIONS.users, id);
    const cleaned: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "password" || v === undefined) continue;
      cleaned[k] = v === null ? null : v;
    }
    await updateDoc(ref, cleaned);
    return get().users.find((u) => u.id === id) ?? null;
  },

  async remove(id) {
    set({ users: get().users.filter((u) => u.id !== id) });
    if (!isFirebaseConfigured()) return;
    await deleteDoc(doc(getDb(), COLLECTIONS.users, id));
    // Firestore profile gone. The Firebase Auth user still exists — admin
    // must disable/delete them in the Firebase Console (or via a Cloud
    // Function with the Admin SDK).
  },

  async setStatus(id, status) {
    set({
      users: get().users.map((u) => (u.id === id ? { ...u, status } : u)),
    });
    if (!isFirebaseConfigured()) return;
    await updateDoc(doc(getDb(), COLLECTIONS.users, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  },

  async resetPassword(id, newPassword) {
    if (!isFirebaseConfigured()) {
      // Demo mode: just overwrite the local password.
      if (!newPassword) return;
      set({
        users: get().users.map((u) =>
          u.id === id ? { ...u, password: newPassword } : u,
        ),
      });
      return;
    }
    const user = get().users.find((u) => u.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    if (!newPassword || newPassword.length < 6) {
      throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");
    }
    // Hit the server route which uses Admin SDK to actually set the
    // password on Firebase Auth. The previous implementation called
    // sendPasswordResetEmail which (a) requires the user to click an
    // email link, (b) does not work for students whose Auth email is
    // synthetic (`@students.fsc.local`).
    const caller = getAuthSafe().currentUser;
    if (!caller) {
      throw new Error("Bạn cần đăng nhập lại trước khi đặt mật khẩu.");
    }
    const idToken = await caller.getIdToken();
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ targetUserId: id, newPassword }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        data.error ?? `Đặt mật khẩu thất bại (HTTP ${res.status})`,
      );
    }
  },

  findById(id) {
    return get().users.find((u) => u.id === id);
  },

  findByIdentifier(identifier) {
    const q = identifier.trim().toLowerCase();
    return get().users.find(
      (u) =>
        u.email.toLowerCase() === q ||
        u.id.toLowerCase() === q ||
        (u.username && u.username.toLowerCase() === q) ||
        (u.studentCode && u.studentCode.toLowerCase() === q),
    );
  },

  validateCredentials() {
    // Legacy local-only check, replaced by Firebase Auth. Kept as a no-op
    // so we don't have to chase every caller in one go.
    return null;
  },

  _applySnapshot(users) {
    set({ users, hydrated: true });
  },
}));

/**
 * Start listening to the /users collection. Call once on the client.
 * Returns the unsubscribe fn for cleanup.
 *
 * NOTE: this listener returns ALL users — Firestore security rules
 * filter what the caller can actually read. Admins see their campus;
 * superadmin sees everyone; teachers/students see only themselves.
 */
export function subscribeUsers(): Unsubscribe {
  if (!isFirebaseConfigured()) {
    // No backend to subscribe to. Mark hydrated so the rest of the app
    // doesn't wait on a snapshot that will never arrive.
    useUsersStore.getState()._applySnapshot(useUsersStore.getState().users);
    return () => {
      /* no-op */
    };
  }
  const q = query(collection(getDb(), COLLECTIONS.users));
  return onSnapshot(
    q,
    (snap) => {
      const rows: SeedUser[] = snap.docs.map((d) => {
        const data = d.data() as Partial<SeedUser>;
        return {
          ...(data as SeedUser),
          id: d.id,
          password: "",
        };
      });
      useUsersStore.getState()._applySnapshot(rows);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn("[users-store] snapshot error", err);
    },
  );
}

/**
 * Cryptographically-weak password generator used when admin creates a
 * user — they hand the generated string to the new user, who can
 * change it after first login via "Forgot password?".
 */
export function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** Internal slug for synthetic Firebase Auth emails. Strips Vietnamese
 *  diacritics + non-alphanumerics so the resulting email is valid. */
function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

interface ResolvedAccount {
  /** Email used as the Firebase Auth identity. For staff = input.email
   *  verbatim. For students = either a real email, the supplied
   *  username, or an auto-generated `{username}@students.fsc.local`. */
  loginEmail: string;
  username?: string;
  studentCode?: string;
}

/**
 * Resolve the login email + username + studentCode for a user-create
 * input. Staff are passed through. Students get auto-generated
 * studentCode + username when not supplied; the login email collapses
 * onto a synthetic `…@students.fsc.local` so Firebase Auth (which
 * requires email) can store the account without exposing a real one.
 */
function resolveStudentAccount(
  input: CreateUserInput,
  existing: SeedUser[],
): ResolvedAccount {
  if (input.role !== "student") {
    if (!input.email) {
      throw new Error("Nhân viên / giáo viên cần email.");
    }
    return { loginEmail: input.email.trim().toLowerCase() };
  }

  // Determine studentCode — prefer supplied, fall back to
  // `{campusCode || HS}-{seq4}` where seq4 is the highest existing
  // matching code +1.
  let studentCode = input.studentCode?.trim();
  if (!studentCode) {
    const prefix = slug(input.campusId ?? "hs").slice(0, 8) || "hs";
    const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
    const max = existing.reduce((acc, u) => {
      const m = re.exec(u.studentCode ?? "");
      return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
    }, 0);
    studentCode = `${prefix}-${String(max + 1).padStart(4, "0")}`.toUpperCase();
  }

  // Username — prefer supplied, fall back to studentCode lowercased.
  let username = input.username?.trim().toLowerCase();
  if (!username) {
    username = studentCode.toLowerCase();
  }
  // Uniqueness check — collide with existing username, studentCode, or
  // synthetic login email.
  const conflict = existing.find(
    (u) =>
      u.username?.toLowerCase() === username ||
      u.studentCode?.toLowerCase() === username ||
      u.email.toLowerCase() === `${username}@students.fsc.local`,
  );
  if (conflict) {
    throw new Error(
      `Tài khoản "${username}" đã tồn tại — chọn tên khác hoặc để trống để hệ thống tự sinh.`,
    );
  }

  // Firebase Auth always uses the synthetic email for students so the
  // login flow can construct it directly from the typed username —
  // NO Firestore lookup needed, NO mirror race. The real contact
  // email (if admin provided one) lives separately on the profile
  // doc for password-reset / notification purposes.
  const loginEmail = `${username}@students.fsc.local`;
  return { loginEmail, username, studentCode };
}
