"use client";

import { useEffect, useRef } from "react";

import { subscribeUsers } from "@/features/admin/users/users-store";
import { subscribeCampuses } from "@/features/campus/state/campuses-store";
import { subscribeExamForms } from "@/features/exam-forms/state/exam-forms-store";
import { subscribeShifts } from "@/features/exam-shifts/state/shifts-store";
import { subscribeMaterials } from "@/features/learning-materials/state/materials-store";
import { subscribeHomework } from "@/features/homework/state/homework-store";
import { subscribeHomeworkAttempts } from "@/features/homework/state/homework-attempts-store";
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

import {
  startAuthSubscription,
  useAuthStore,
  type AuthSession,
} from "../state/auth-store";

/**
 * Build the data subscriptions for a signed-in session.
 *
 * Students get a SCOPED set: their homework attempts are filtered to
 * their own uid (so one student's save doesn't fan out to all 1700
 * listeners), and teaching assignments (teacher-only) are skipped.
 * Proctor events ARE kept for students — the exam runtime reads them to
 * show live messages the proctor sends during a shift. Staff keep the
 * full set.
 *
 * Note: collections like questions/users/attempts are still loaded whole
 * here — narrowing those per-student is the next scaling step (P1).
 */
function startDataSubscriptions(session: AuthSession): Array<() => void> {
  const isStudent = session.role === "student";
  const subs: Array<() => void> = [
    // Students load only their own user doc (permissions + class
    // membership); staff need the whole directory for admin / reports.
    isStudent ? subscribeUsers({ selfId: session.userId }) : subscribeUsers(),
    subscribeCampuses(),
    subscribeSubjects(),
    subscribeGradesCatalog(),
    subscribeBlueprints(),
    subscribePackages(),
    subscribeShifts(),
    isStudent
      ? subscribeAttempts({ studentId: session.userId })
      : subscribeAttempts(),
    isStudent
      ? subscribeProctorEvents({ studentId: session.userId })
      : subscribeProctorEvents(),
    isStudent
      ? subscribeGrading({ studentId: session.userId })
      : subscribeGrading(),
    subscribeMaterials(),
    subscribeHomework(),
    isStudent
      ? subscribeHomeworkAttempts({ studentId: session.userId })
      : subscribeHomeworkAttempts(),
  ];
  // Staff-only whole-collection loads. Students skip these (and the rules
  // now DENY students reading /questions & /exam_forms):
  //   • questions & exam_forms — carry answer keys; students get
  //     answer-stripped questions from /api/exam|homework/[id]/questions
  //     and full answers only post-submit via /review. Reading them
  //     directly is blocked server-side.
  //   • teaching — assignments map teachers → classes; no student screen
  //     reads them.
  if (!isStudent) {
    subs.push(subscribeQuestions(), subscribeExamForms(), subscribeTeaching());
  }
  return subs;
}

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

  // Auth subscription only.
  // (Login no longer needs a pre-signin full /users mirror — the login
  // form resolves a typed username / mã HS → email via a scoped /users
  // query on demand. See resolveLoginEmail in firebase-auth.ts.)
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
    return () => {
      unsubAuth();
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
        dataUnsubsRef.current = startDataSubscriptions(state.session);
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
        dataUnsubsRef.current = startDataSubscriptions(current);
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
