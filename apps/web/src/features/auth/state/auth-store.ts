"use client";

import { create } from "zustand";

import { useUsersStore } from "@/features/admin/users/users-store";
import {
  signInWithEmail,
  signOut as fbSignOut,
  subscribeAuth,
} from "@/features/auth/lib/firebase-auth";
import { isFirebaseConfigured } from "@/lib/firebase";

export type Role =
  | "superadmin"
  | "academic-director"
  | "campus-admin"
  | "subject-lead"
  | "teacher"
  | "student";

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** Cross-campus roles (superadmin) have null. Everyone else is bound. */
  campusId: string | null;
  /** Compatibility with the existing exam API. */
  studentId: string;
  signedInAt: number;
}

export type SignInResult =
  | { ok: true; session: AuthSession }
  | {
      ok: false;
      reason:
        | "not_found"
        | "invalid_password"
        | "suspended"
        | "network"
        | "role_mismatch";
    };

interface AuthState {
  session: AuthSession | null;
  recentAttemptIds: string[];
  /**
   * `true` once the initial Firebase Auth state has been resolved. UI
   * waits on this before showing "signed out" so we don't flash the
   * login screen during page refresh.
   */
  hydrated: boolean;
}

interface AuthActions {
  /**
   * Sign in via Firebase Auth (email + password). Returns a tagged
   * result so the UI can show a specific cause. On success, the
   * `session` field is populated by the subscribeAuth listener that
   * fires immediately after.
   *
   * `expectedRole` (optional) lets the login UI gate the result so a
   * student can't accidentally sign in via the staff tab and vice
   * versa. Mismatch returns `reason: "role_mismatch"` and signs back
   * out.
   */
  signIn(input: {
    identifier: string;
    password: string;
    expectedRole?: "staff" | "student";
  }): Promise<SignInResult>;
  signOut(): Promise<void>;
  rememberAttempt(id: string): void;
  forgetAttempt(id: string): void;
  /** Internal — called by the auth subscription. */
  _applySession(session: AuthSession | null): void;
}

const MAX_REMEMBERED = 20;

export const useAuthStore = create<AuthState & AuthActions>()((set, get) => ({
  session: null,
  recentAttemptIds: [],
  hydrated: false,

  async signIn({ identifier, password, expectedRole }) {
    function roleMatches(role: AuthSession["role"]): boolean {
      if (!expectedRole) return true;
      if (expectedRole === "student") return role === "student";
      return role !== "student"; // staff tab → anyone non-student
    }

    // Demo / offline mode — when Firebase isn't configured, validate
    // against the seed users so the UI is usable for preview without a
    // backend. Replaced by real Firebase Auth once `.env.local` is set.
    if (!isFirebaseConfigured()) {
      const users = useUsersStore.getState();
      const user = users.findByIdentifier(identifier);
      if (!user) return { ok: false, reason: "not_found" };
      if (user.password !== password)
        return { ok: false, reason: "invalid_password" };
      if (user.status !== "active")
        return { ok: false, reason: "suspended" };
      if (!roleMatches(user.role))
        return { ok: false, reason: "role_mismatch" };
      const session: AuthSession = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        campusId: user.campusId,
        studentId: user.id,
        signedInAt: Date.now(),
      };
      set({ session, hydrated: true });
      return { ok: true, session };
    }

    // If the user typed a username / studentCode (not an email), look
    // it up in the local users-store mirror to find the synthetic
    // Firebase Auth email this account actually signs in with.
    let loginIdentifier = identifier.trim();
    if (!loginIdentifier.includes("@")) {
      const u = useUsersStore.getState().findByIdentifier(loginIdentifier);
      if (u && u.email) loginIdentifier = u.email;
      // If we can't resolve (mirror not loaded yet), Firebase Auth will
      // reject and the UI shows "invalid credentials" — caller retries.
    }
    const result = await signInWithEmail(loginIdentifier, password);
    if (!result.ok) return result;
    if (!roleMatches(result.session.role)) {
      // Auth succeeded but the wrong tab was used — sign back out so
      // the listener doesn't keep them on a half-rejected session.
      await fbSignOut();
      return { ok: false, reason: "role_mismatch" };
    }
    // The subscribeAuth listener will set session, but apply it eagerly
    // so navigations right after signIn() see the session immediately.
    set({ session: result.session });
    return { ok: true, session: result.session };
  },

  async signOut() {
    if (isFirebaseConfigured()) {
      await fbSignOut();
    }
    set({ session: null, recentAttemptIds: [] });
  },

  rememberAttempt(id) {
    const next = [id, ...get().recentAttemptIds.filter((x) => x !== id)].slice(
      0,
      MAX_REMEMBERED,
    );
    set({ recentAttemptIds: next });
  },

  forgetAttempt(id) {
    set({ recentAttemptIds: get().recentAttemptIds.filter((x) => x !== id) });
  },

  _applySession(session) {
    set({ session, hydrated: true });
  },
}));

/**
 * Initialise the auth subscription. Call once on the client (the
 * authenticated layout does this via `<AuthBootstrap />`). Returns the
 * unsubscribe fn for cleanup.
 */
export function startAuthSubscription(): () => void {
  return subscribeAuth((session) => {
    useAuthStore.getState()._applySession(session);
  });
}

export function isSuperadmin(session: AuthSession | null): boolean {
  return session?.role === "superadmin";
}
