"use client";

import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
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
import { getAuthSafe, getDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";

export interface CreateUserInput {
  name: string;
  email: string;
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

export const useUsersStore = create<UsersState & UsersActions>()((set, get) => ({
  // Start with seed data so dropdowns aren't empty before the first
  // snapshot arrives. The snapshot will overwrite this.
  users: SEED_USERS,
  hydrated: false,

  async create(input) {
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
        input.email.trim().toLowerCase(),
        input.password,
      );
      const uid = cred.user.uid;
      const now = new Date().toISOString();
      const profile: Omit<SeedUser, "password"> & {
        createdAt: string;
        updatedAt: ReturnType<typeof serverTimestamp>;
      } = {
        id: uid,
        email: input.email.trim().toLowerCase(),
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
        createdAt: now,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(getDb(), COLLECTIONS.users, uid), profile);
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
    const ref = doc(getDb(), COLLECTIONS.users, id);
    // Build the partial — strip undefined + ignore password (handled separately).
    const cleaned: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "password" || v === undefined) continue;
      cleaned[k] = v === null ? null : v;
    }
    await updateDoc(ref, cleaned);
    return get().users.find((u) => u.id === id) ?? null;
  },

  async remove(id) {
    await deleteDoc(doc(getDb(), COLLECTIONS.users, id));
    // Firestore profile gone. The Firebase Auth user still exists — admin
    // must disable/delete them in the Firebase Console (or via a Cloud
    // Function with the Admin SDK).
  },

  async setStatus(id, status) {
    await updateDoc(doc(getDb(), COLLECTIONS.users, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  },

  async resetPassword(id) {
    const user = get().users.find((u) => u.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    await sendPasswordResetEmail(getAuthSafe(), user.email);
  },

  findById(id) {
    return get().users.find((u) => u.id === id);
  },

  findByIdentifier(identifier) {
    const q = identifier.trim().toLowerCase();
    return get().users.find(
      (u) => u.email.toLowerCase() === q || u.id.toLowerCase() === q,
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
