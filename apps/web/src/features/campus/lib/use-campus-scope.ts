"use client";

import { useMemo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "../state/campus-store";
import { useCampusesStore } from "../state/campuses-store";

import type { Subject } from "@/features/subjects/data/seed-subjects";
import type { Grade, SchoolClass } from "@/features/grades/data/seed-grades";

/**
 * Single source of truth for "what campus is this admin acting on?"
 * Resolves once per render and exposes the helpers most authoring
 * dialogs need so we don't have to repeat the filter shapes in every
 * subject / grade / class / user dropdown.
 *
 *   operatingCampusId:
 *     - superadmin → useCampusStore.activeCampusId (their picker)
 *     - everyone else → session.campusId (locked)
 *     - null when no session OR superadmin hasn't picked a campus
 *
 *   operatingCampus: full Campus object (gradeIds etc.) or null.
 *
 *   scopeSubjects(list):
 *     Returns the subset of subjects that belong to or are unrestricted
 *     for the operating campus AND teach at least one grade tier the
 *     campus serves. Falls through to the full list when no campus is
 *     selected (superadmin viewing all).
 *
 *   scopeGrades(list):
 *     Returns the subset of grades the operating campus offers (K1-K9
 *     for primary-secondary, K10-12 for high school, etc.). Falls
 *     through to the full list when no campus is selected.
 *
 *   scopeClasses(list):
 *     Returns the subset of classes whose campusId matches. Falls
 *     through to the full list when no campus is selected.
 *
 *   inCampus(entity):
 *     Boolean predicate: does the entity belong to the operating
 *     campus? Accepts any object with `campusId` or `campusIds`.
 *     Returns true when no campus is selected (avoids hiding
 *     everything from a superadmin not focused on a campus).
 */
export function useCampusScope() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allCampuses = useCampusesStore((s) => s.campuses);

  const operatingCampusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;

  const operatingCampus = useMemo(() => {
    if (!operatingCampusId) return null;
    return allCampuses.find((c) => c.id === operatingCampusId) ?? null;
  }, [operatingCampusId, allCampuses]);

  return useMemo(() => {
    return {
      operatingCampusId,
      operatingCampus,

      scopeSubjects<T extends Pick<Subject, "campusIds" | "gradeIds">>(
        list: T[],
      ): T[] {
        if (!operatingCampus) return list;
        return list.filter((s) => {
          const inCampus =
            !s.campusIds ||
            s.campusIds.length === 0 ||
            s.campusIds.includes(operatingCampus.id);
          if (!inCampus) return false;
          if (!Array.isArray(s.gradeIds) || s.gradeIds.length === 0) {
            return true;
          }
          return s.gradeIds.some((gid) =>
            operatingCampus.gradeIds.includes(gid),
          );
        });
      },

      scopeGrades<T extends Pick<Grade, "id">>(list: T[]): T[] {
        if (!operatingCampus) return list;
        return list.filter((g) => operatingCampus.gradeIds.includes(g.id));
      },

      scopeClasses<T extends Pick<SchoolClass, "campusId">>(list: T[]): T[] {
        if (!operatingCampus) return list;
        return list.filter((c) => c.campusId === operatingCampus.id);
      },

      /** Predicate works on users, classes, materials, etc. Anything
       *  with `campusId` (singular) or `campusIds` (plural, like
       *  subjects). */
      inCampus(entity: {
        campusId?: string | null;
        campusIds?: string[];
      }): boolean {
        if (!operatingCampus) return true;
        if (entity.campusIds) {
          return (
            entity.campusIds.length === 0 ||
            entity.campusIds.includes(operatingCampus.id)
          );
        }
        if (typeof entity.campusId === "string") {
          return entity.campusId === operatingCampus.id;
        }
        // No campus field at all → don't filter out.
        return true;
      },
    };
  }, [operatingCampusId, operatingCampus]);
}
