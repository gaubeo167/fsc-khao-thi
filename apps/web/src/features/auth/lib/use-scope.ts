"use client";

import { createContext, useContext, useMemo } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import { subjectIdsOfUser } from "./subject-scope";

/**
 * Resolve the current user's "scope" — which subjects + grades they are
 * actually authorised to work on. Used by question creation, blueprint
 * authoring, and shift-wizard pickers to LOCK every input to a teacher's
 * teaching assignment.
 *
 * Permission ladder:
 *   - superadmin / academic-director / campus-admin → unscoped (do anything
 *     within their campus). `allowedSubjectIds = null` means "no
 *     restriction"; callers should treat null as a wildcard.
 *   - subject-lead → bound to their subject (single). Grades: their
 *     `gradeIds` if set, else any (TBM thường phụ trách nhiều khối).
 *   - teacher → bound to `user.subjectIds` (fallback to `user.subject`)
 *     × `user.gradeIds` (empty = all grades within their subject).
 *
 * `hasScope` is `false` for a teacher whose admin forgot to set any
 * subject — UI surfaces a clear "Bạn chưa được giao môn nào" hint
 * instead of silently allowing everything.
 */
export interface UserScope {
  /** null = unscoped (admin-class role). */
  allowedSubjectIds: Set<string> | null;
  /** null = unscoped or no grade restriction within scope. */
  allowedGradeIds: Set<string> | null;
  /** True when role is in the admin-class bypass list. */
  isUnscoped: boolean;
  /** True for teachers that have at least one assigned subject. */
  hasScope: boolean;
}

/**
 * React context for the resolved scope. Populated once by `<ScopeProvider>`
 * at the authenticated-layout root and consumed by every page via
 * `useUserScope()`. This collapses N component-level subscriptions (each
 * one a separate Zustand listener) into a single source of truth.
 *
 * Exported so `scope-provider.tsx` can wrap children in this context.
 */
export const ScopeContext = createContext<UserScope | null>(null);

// Luật "người này phụ trách môn nào" sống ở `subject-scope.ts` — thuần, không
// dính React, nên test được thẳng bằng node. Bày lại ở đây để chỗ gọi cũ chỉ
// cần nhớ một đường dẫn.
export {
  subjectIdsOfUser,
  userTeachesSubject,
  filterSubjectsByScope,
  filterGradesByScope,
} from "./subject-scope";

export function useUserScope(): UserScope {
  const ctx = useContext(ScopeContext);
  // Fall back to the direct hook if no provider is mounted (e.g. unit
  // tests, isolated stories). Production routes always wrap with
  // <ScopeProvider> via the authenticated layout.
  const fallback = useResolveScope();
  return ctx ?? fallback;
}

/** Internal — the actual computation. Called once via ScopeProvider. */
export function useResolveScope(): UserScope {
  const session = useAuthStore((s) => s.session);
  const users = useUsersStore((s) => s.users);
  const subjects = useSubjectsStore((s) => s.subjects);

  return useMemo<UserScope>(() => {
    if (!session)
      return {
        allowedSubjectIds: new Set(),
        allowedGradeIds: new Set(),
        isUnscoped: false,
        hasScope: false,
      };
    if (
      session.role === "superadmin" ||
      session.role === "academic-director" ||
      session.role === "campus-admin"
    ) {
      return {
        allowedSubjectIds: null,
        allowedGradeIds: null,
        isUnscoped: true,
        hasScope: true,
      };
    }
    // teacher / subject-lead — bound to their user record. Cùng một hàm với
    // chỗ hỏi về NGƯỜI KHÁC (`subjectIdsOfUser`), để không có luật thứ hai.
    const u = users.find((x) => x.id === session.userId);
    const allowedSubjectIds = subjectIdsOfUser(u, subjects) ?? new Set<string>();

    const rawGradeIds = u?.gradeIds ?? [];
    const allowedGradeIds: Set<string> | null =
      rawGradeIds.length > 0 ? new Set(rawGradeIds) : null; // null = any grade

    return {
      allowedSubjectIds,
      allowedGradeIds,
      isUnscoped: false,
      hasScope: allowedSubjectIds.size > 0,
    };
  }, [session, users, subjects]);
}

/** Convenience predicate — true iff scope permits this (subject, grade). */
export function isInScope(
  scope: UserScope,
  subjectId: string | null | undefined,
  gradeId: string | null | undefined,
): boolean {
  if (scope.isUnscoped) return true;
  if (subjectId == null) return false;
  if (!scope.allowedSubjectIds || !scope.allowedSubjectIds.has(subjectId))
    return false;
  if (scope.allowedGradeIds == null) return true; // no grade restriction
  if (gradeId == null) return false;
  return scope.allowedGradeIds.has(gradeId);
}



/** Specific authoring permissions — read role + optional per-user override.
 *
 *   - superadmin / academic-director / campus-admin / subject-lead → always allowed
 *   - teacher → only if the matching `permissions.canCreate*` flag is set
 *   - student → never
 *
 * Returns `null` if there's no session. */
export type CreateAction =
  | "blueprint"
  | "package"
  | "shift";

export function useCanCreate(action: CreateAction): boolean {
  const session = useAuthStore((s) => s.session);
  const users = useUsersStore((s) => s.users);
  return useMemo(() => {
    if (!session) return false;
    if (session.role === "student") return false;
    if (
      session.role === "superadmin" ||
      session.role === "academic-director" ||
      session.role === "campus-admin" ||
      session.role === "subject-lead"
    ) {
      return true;
    }
    // teacher — check override flag.
    const u = users.find((x) => x.id === session.userId);
    // "blueprint" and "package" share a single umbrella flag
    // `canCreateBlueprint` (merged "Quản lý đề thi" permission). A legacy
    // canCreatePackage flag is honored as a fallback for old records.
    const flag =
      action === "shift"
        ? u?.permissions?.canCreateShift
        : u?.permissions?.canCreateBlueprint === true ||
          u?.permissions?.canCreatePackage === true;
    return flag === true;
  }, [session, users, action]);
}
