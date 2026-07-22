/**
 * POST /api/homework/[id]/questions
 *
 * Serves a homework's questions to a student with ANSWER KEYS STRIPPED
 * (see stripAnswers). Grading happens server-side in /submit. Mirrors the
 * exam questions route but sources questions from homework.questionIds.
 */
import { FieldPath } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import type { Question } from "@/features/question-bank/data/seed-questions";
import { verifyCaller } from "@/lib/api-auth";
import { stripForServe } from "@/lib/exam/matching-opaque";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { role, campusId } = gate.caller;

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
  // Preserve the homework's question order.
  const questions = ids
    .map((qid) => byId.get(qid))
    .filter((q): q is Question => !!q)
    .map(stripForServe);

  return NextResponse.json({ questions });
}
