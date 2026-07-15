/**
 * POST /api/exam/[shiftId]/review
 *
 * Returns the FULL questions (WITH answer keys) for a student's OWN
 * SUBMITTED attempt, so the result page can show correct/incorrect per
 * question. Answers are only released AFTER submission (submittedAt set),
 * and the exam is 1-attempt, so this can't be used to peek mid-exam.
 *
 * Returns: { questions: Question[] }  (empty if not submitted / no attempt)
 */
import { FieldPath } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import {
  pickVariantForStudent,
  type ExamForm,
} from "@/features/exam-forms/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { verifyCaller } from "@/lib/api-auth";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid } = gate.caller;

  const { db } = getAdmin();

  const attemptId = `att-${shiftId}-${uid}`;
  const attSnap = await db.collection("attempts").doc(attemptId).get();
  if (!attSnap.exists) {
    return NextResponse.json({ questions: [] });
  }
  const att = attSnap.data() as {
    submittedAt?: string | null;
    questionIds?: string[];
    examFormId?: string | null;
  };
  // Only release answers after the student has submitted.
  if (!att.submittedAt) {
    return NextResponse.json({ error: "not_submitted", questions: [] }, { status: 403 });
  }

  let questions: Question[] = [];

  if (att.examFormId) {
    const formSnap = await db.collection("exam_forms").doc(att.examFormId).get();
    if (formSnap.exists) {
      const form = { ...(formSnap.data() as ExamForm), id: formSnap.id };
      const variant = pickVariantForStudent(form, uid);
      if (variant) questions = variant.questions as unknown as Question[];
    }
  }

  if (questions.length === 0) {
    const ids = [...new Set(att.questionIds ?? [])].slice(0, 200);
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
    questions = ids.map((qid) => byId.get(qid)).filter((q): q is Question => !!q);
  }

  return NextResponse.json({ questions });
}
