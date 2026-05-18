"use client";

import { useEffect } from "react";

import { subscribeUsers } from "@/features/admin/users/users-store";
import { subscribeCampuses } from "@/features/campus/state/campuses-store";
import { subscribeShifts } from "@/features/exam-shifts/state/shifts-store";
import { subscribeBlueprints } from "@/features/exams/state/blueprints-store";
import { subscribePackages } from "@/features/exams/state/packages-store";
import { subscribeGradesCatalog } from "@/features/grades/state/grades-store";
import { subscribeGrading } from "@/features/grading/state/grading-store";
import { subscribeQuestions } from "@/features/question-bank/state/questions-store";
import { subscribeAttempts } from "@/features/shift-exam/state/attempts-store";
import { subscribeSubjects } from "@/features/subjects/state/subjects-store";
import { subscribeTeaching } from "@/features/teaching/state/teaching-store";
import { isFirebaseConfigured } from "@/lib/firebase";

import { startAuthSubscription, useAuthStore } from "../state/auth-store";

/**
 * Mounts the two long-lived Firebase listeners exactly once:
 *
 *   1. `onAuthStateChanged` — keeps `useAuthStore.session` in sync with
 *      Firebase Auth (handles refresh, sign-in from another tab, token
 *      expiry, …).
 *   2. `onSnapshot(/users)` — keeps `useUsersStore.users` in sync with
 *      Firestore so dropdowns / admin tables stay live.
 *
 * If Firebase env vars are missing (typical for dev before configuring
 * `.env.local`), we skip both and log a single warning so the rest of
 * the UI still renders with seed data.
 */
export function AuthBootstrap() {
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[FSC] Firebase env vars not set — running in offline / seed-data mode. " +
          "Copy apps/web/.env.example to .env.local and fill in values to enable auth.",
      );
      // Unblock the authenticated layout so it stops showing the spinner;
      // it'll redirect to /login because session is null.
      useAuthStore.getState()._applySession(null);
      return;
    }
    const unsubs: Array<() => void> = [];
    try {
      unsubs.push(startAuthSubscription());
      unsubs.push(subscribeUsers());
      unsubs.push(subscribeCampuses());
      unsubs.push(subscribeSubjects());
      unsubs.push(subscribeGradesCatalog());
      unsubs.push(subscribeTeaching());
      unsubs.push(subscribeQuestions());
      unsubs.push(subscribeBlueprints());
      unsubs.push(subscribePackages());
      unsubs.push(subscribeShifts());
      unsubs.push(subscribeAttempts());
      unsubs.push(subscribeGrading());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[FSC] Firebase bootstrap failed:", e);
    }
    return () => {
      for (const u of unsubs) u();
    };
  }, []);
  return null;
}
