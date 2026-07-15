/**
 * POST /api/exam/[shiftId]/submit
 *
 * Server-AUTHORITATIVE exam submission. The client sends only its
 * `answers`; the server loads the correct questions (from the frozen
 * exam_form, or the questions the student answered as a legacy fallback),
 * grades them with the Admin SDK, and writes score/submittedAt itself.
 *
 * This closes the "student writes score=100 to their own attempt" hole:
 * the /attempts rule forbids students from setting score/submittedAt, so
 * the only way to finalize is through this verified route.
 *
 * Body: { answers: Record<questionId, Answer>, violations?, markedForReview? }
 * Returns: { ok, score, correctCount, maxScore, submittedAt }
 */
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { pickVariantForStudent, type ExamForm } from "@/features/exam-forms/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";
import { verifyCaller } from "@/lib/api-auth";
import { computeAttemptScore } from "@/lib/exam/grade";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid, role, campusId } = gate.caller;

  let body: { answers?: Record<string, Answer> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body không hợp lệ." }, { status: 400 });
  }
  const answers = (body?.answers ?? {}) as Record<string, Answer>;

  const { db } = getAdmin();

  // ── Load shift + eligibility ──────────────────────────────────────────
  const shiftSnap = await db.collection("shifts").doc(shiftId).get();
  if (!shiftSnap.exists) {
    return NextResponse.json({ error: "not_found", message: "Ca thi không tồn tại." }, { status: 404 });
  }
  const shift = shiftSnap.data() as {
    campusId?: string | null;
    packageId?: string;
    rooms?: Array<{ studentIds?: string[] }>;
    endAt?: string;
  };

  if (role === "student") {
    const inRoster = (shift.rooms ?? []).some((r) => (r.studentIds ?? []).includes(uid));
    if (!inRoster) {
      return NextResponse.json({ error: "forbidden", message: "Bạn không thuộc ca thi này." }, { status: 403 });
    }
    if (shift.campusId && campusId && shift.campusId !== campusId) {
      return NextResponse.json({ error: "forbidden", message: "Ca thi khác campus." }, { status: 403 });
    }
  }

  // ── Resolve the authoritative question set (with answers) ─────────────
  let questions: Question[] = [];
  let examFormId: string | null = null;
  let variantId: string | null = null;

  const formsSnap = await db
    .collection("exam_forms")
    .where("shiftId", "==", shiftId)
    .where("lifecycle", "==", "active")
    .limit(1)
    .get();
  if (!formsSnap.empty) {
    const doc = formsSnap.docs[0]!;
    const form = { ...(doc.data() as ExamForm), id: doc.id };
    const variant = pickVariantForStudent(form, uid);
    if (variant) {
      questions = variant.questions as unknown as Question[];
      examFormId = form.id;
      variantId = variant.variantId;
    }
  }

  // Legacy fallback (shift published before snapshots): grade the questions
  // the student actually answered, loaded fresh from /questions.
  if (questions.length === 0) {
    const ids = Object.keys(answers).slice(0, 200);
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await db
        .collection("questions")
        .where(FieldPath.documentId(), "in", chunk)
        .get();
      for (const d of snap.docs) questions.push({ ...(d.data() as Question), id: d.id });
    }
  }

  // ── Grade (server-side) ───────────────────────────────────────────────
  const { score, correctCount, maxScore } = computeAttemptScore(questions, answers);

  // ── Write the attempt authoritatively ────────────────────────────────
  const attemptId = `att-${shiftId}-${uid}`;
  const ref = db.collection("attempts").doc(attemptId);
  const existing = await ref.get();
  if (existing.exists && (existing.data()?.submittedAt ?? null) != null) {
    return NextResponse.json({ error: "already_submitted", message: "Bài đã nộp." }, { status: 409 });
  }
  const prev = (existing.exists ? existing.data() : {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  await ref.set(
    {
      id: attemptId,
      shiftId,
      studentId: uid,
      campusId: campusId ?? null,
      questionIds: questions.map((q) => q.id),
      examFormId,
      variantId,
      answers,
      markedForReview: (prev.markedForReview as string[]) ?? [],
      startedAt: (prev.startedAt as string) ?? now,
      submittedAt: now,
      score,
      maxScore,
      correctCount,
      violations:
        (prev.violations as Record<string, number>) ?? {
          tabSwitches: 0,
          fullscreenExits: 0,
          pasteAttempts: 0,
        },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, score, correctCount, maxScore, submittedAt: now });
}
