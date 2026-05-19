"use client";

import { useEffect, useRef } from "react";

import { subscribeUsers } from "@/features/admin/users/users-store";
import { subscribeCampuses } from "@/features/campus/state/campuses-store";
import { subscribeShifts } from "@/features/exam-shifts/state/shifts-store";
import { subscribeBlueprints } from "@/features/exams/state/blueprints-store";
import { subscribePackages } from "@/features/exams/state/packages-store";
import { subscribeGradesCatalog } from "@/features/grades/state/grades-store";
import { subscribeGrading } from "@/features/grading/state/grading-store";
import { subscribeQuestions } from "@/features/question-bank/state/questions-store";
import { subscribeAttempts } from "@/features/shift-exam/state/attempts-store";
import { subscribeProctorEvents } from "@/features/shift-exam/state/proctor-store";
import { subscribeSubjects } from "@/features/subjects/state/subjects-store";
import { subscribeTeaching } from "@/features/teaching/state/teaching-store";
import { isFirebaseConfigured } from "@/lib/firebase";

import { startAuthSubscription, useAuthStore } from "../state/auth-store";

/**
 * Boots Firebase listeners.
 *
 * Auth subscription is permanent. Data subscriptions (campuses,
 * subjects, …) are started ONLY after a user is signed in, because
 * Firestore security rules require `isSignedIn()` for reads — if we
 * subscribed pre-login, the snapshot would be permission-denied and
 * stay empty even after the user signed in (the listener doesn't
 * auto-retry on auth change). Tearing down / restarting them on each
 * session change keeps everything in sync.
 *
 * If Firebase env vars are missing, both are skipped and the UI falls
 * back to seed data in demo mode.
 */
export function AuthBootstrap() {
  const dataUnsubsRef = useRef<Array<() => void>>([]);

  // Auth subscription + early /users mirror.
  // The /users mirror runs PRE-SIGNIN so the login form can map a typed
  // username / mã HS → the underlying Firebase Auth email before
  // calling signInWithEmailAndPassword. (Firestore rule has been
  // relaxed to public-read on /users for this reason.)
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[FSC] Firebase env vars not set — running in offline / seed-data mode. " +
          "Copy apps/web/.env.example to .env.local and fill in values to enable auth.",
      );
      useAuthStore.getState()._applySession(null);
      return;
    }
    const unsubAuth = startAuthSubscription();
    const unsubUsers = subscribeUsers();
    return () => {
      unsubAuth();
      unsubUsers();
    };
  }, []);

  // Data subscriptions — start when signed in, tear down on signout.
  // Subscribing post-signin avoids permission-denied snapshots that
  // would leave stores empty until a manual hard-refresh.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const unsubAuthStore = useAuthStore.subscribe((state, prev) => {
      const sessionChanged = state.session?.userId !== prev.session?.userId;
      if (!sessionChanged) return;
      // Tear down whatever's currently subscribed.
      for (const u of dataUnsubsRef.current) u();
      dataUnsubsRef.current = [];
      // No active session → leave stores empty.
      if (!state.session) return;
      // Start a fresh set of subscriptions under the new auth context.
      try {
        dataUnsubsRef.current = [
          subscribeUsers(),
          subscribeCampuses(),
          subscribeSubjects(),
          subscribeGradesCatalog(),
          subscribeTeaching(),
          subscribeQuestions(),
          subscribeBlueprints(),
          subscribePackages(),
          subscribeShifts(),
          subscribeAttempts(),
          subscribeProctorEvents(),
          subscribeGrading(),
        ];
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[FSC] Data subscriptions failed:", e);
      }
    });
    // If a session is already present at mount (e.g., page refresh while
    // signed in), trigger the same flow immediately.
    const current = useAuthStore.getState().session;
    if (current) {
      try {
        dataUnsubsRef.current = [
          subscribeUsers(),
          subscribeCampuses(),
          subscribeSubjects(),
          subscribeGradesCatalog(),
          subscribeTeaching(),
          subscribeQuestions(),
          subscribeBlueprints(),
          subscribePackages(),
          subscribeShifts(),
          subscribeAttempts(),
          subscribeProctorEvents(),
          subscribeGrading(),
        ];
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[FSC] Data subscriptions failed:", e);
      }
    }
    return () => {
      unsubAuthStore();
      for (const u of dataUnsubsRef.current) u();
      dataUnsubsRef.current = [];
    };
  }, []);

  return null;
}
