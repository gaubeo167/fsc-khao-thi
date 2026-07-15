/**
 * POST /api/homework/[id]/submit
 *
 * Server-authoritative homework submission. Loads the real questions,
 * grades with the Admin SDK, writes correctCount/submittedAt itself. The
 * /homework_attempts rule forbids students from setting those fields.
 *
 * Body: { answers: Record<questionId, Answer> }
 * Returns: { ok, correctCount, totalQuestions, submittedAt }
 */
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import type { Question } from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";
import { verifyCaller } from "@/lib/api-auth";
import { gradeQuestion } from "@/lib/exam/grade";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid, role, campusId } = gate.caller;

  let body: { answers?: Record<string, Answer> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const answers = (body?.answers ?? {}) as Record<string, Answer>;

  const { db } = getAdmin();

  const hwSnap = await db.collection("homework").doc(id).get();
  if (!hwSnap.exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const hw = hwSnap.data() as {
    questionIds?: string[];
    campusId?: string | null;
    status?: string;
    archivedAt?: string | null;
  };
  if (hw.archivedAt || hw.status === "draft") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (role === "student" && hw.campusId && campusId && hw.campusId !== campusId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Load the real questions (with answers) to grade.
  const ids = [...new Set(hw.questionIds ?? [])].slice(0, 200);
  const byId = new Map<string, Question>();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const snap = await db
      .collection("questions")
      .where(FieldPath.documentId(), "in", chunk)
      .get();
    for (const d of snap.docs) byId.set(d.id, { ...(d.data() as Question), id: d.id });
  }
  const questions = ids
    .map((qid) => byId.get(qid))
    .filter((q): q is Question => !!q);

  let correctCount = 0;
  for (const q of questions) {
    if (gradeQuestion(q, answers[q.id])?.correct) correctCount += 1;
  }
  const totalQuestions = questions.length;

  const attemptId = `hw-att-${id}-${uid}`;
  const ref = db.collection("homework_attempts").doc(attemptId);
  const existing = await ref.get();
  if (existing.exists && (existing.data()?.submittedAt ?? null) != null) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }
  const prev = (existing.exists ? existing.data() : {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  await ref.set(
    {
      id: attemptId,
      homeworkId: id,
      studentId: uid,
      campusId: campusId ?? null,
      answers,
      markedForReview: (prev.markedForReview as string[]) ?? [],
      startedAt: (prev.startedAt as string) ?? now,
      submittedAt: now,
      correctCount,
      totalQuestions,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, correctCount, totalQuestions, submittedAt: now });
}
