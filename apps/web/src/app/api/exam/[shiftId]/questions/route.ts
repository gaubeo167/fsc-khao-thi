/**
 * POST /api/exam/[shiftId]/questions
 *
 * Serves the questions a student takes an exam with — ANSWER KEYS STRIPPED
 * (see stripAnswers). The student never receives isCorrect/correctAnswer/
 * acceptedAnswers for the auto-gradable field types. Grading happens
 * server-side in /submit.
 *
 * Verifies the caller is in the shift roster + same campus. Loads the
 * frozen exam_form variant (or, for legacy shifts, the blueprint's picked
 * questions).
 *
 * Returns: { questions: Question[](stripped), examFormId, variantId }
 */
import { FieldPath } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import {
  pickVariantForStudent,
  type ExamForm,
} from "@/features/exam-forms/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { verifyCaller } from "@/lib/api-auth";
import { stripForServe } from "@/lib/exam/matching-opaque";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid, role, campusId } = gate.caller;

  const { db } = getAdmin();

  const shiftSnap = await db.collection("shifts").doc(shiftId).get();
  if (!shiftSnap.exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const shift = shiftSnap.data() as {
    campusId?: string | null;
    packageId?: string;
    rooms?: Array<{ studentIds?: string[] }>;
  };

  if (role === "student") {
    const inRoster = (shift.rooms ?? []).some((r) =>
      (r.studentIds ?? []).includes(uid),
    );
    if (!inRoster) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (shift.campusId && campusId && shift.campusId !== campusId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let full: Question[] = [];
  let examFormId: string | null = null;
  let variantId: string | null = null;
  // Diagnostics returned in the response so a "Bộ đề chưa có câu hỏi" case
  // can be root-caused from the browser Network tab without server logs.
  const dbg: Record<string, unknown> = { shiftId, hasPackage: !!shift.packageId };

  // Single-field query (no composite index needed); pick the active form
  // in code. A two-`where` query would require a Firestore composite index
  // that may not exist → throws → route 500 → "Bộ đề chưa có câu hỏi".
  try {
    const formsSnap = await db
      .collection("exam_forms")
      .where("shiftId", "==", shiftId)
      .get();
    dbg.formsMatched = formsSnap.size;
    const doc =
      formsSnap.docs.find((d) => (d.data().lifecycle ?? "active") === "active") ??
      formsSnap.docs[0];
    if (doc) {
      const form = { ...(doc.data() as ExamForm), id: doc.id };
      dbg.variantCount = form.variants?.length ?? 0;
      const variant = pickVariantForStudent(form, uid);
      dbg.variantPicked = !!variant;
      if (variant) {
        full = variant.questions as unknown as Question[];
        dbg.variantQuestionCount = full.length;
        examFormId = form.id;
        variantId = variant.variantId;
      }
    }
  } catch (e) {
    dbg.formQueryError = (e as Error).message;
    // eslint-disable-next-line no-console
    console.error("[exam/questions] exam_forms query failed", e);
  }

  // Legacy fallback: blueprint picked questions.
  if (full.length === 0 && shift.packageId) {
    dbg.fallbackTried = true;
    const pkgSnap = await db.collection("packages").doc(shift.packageId).get();
    const blueprintId = pkgSnap.exists
      ? (pkgSnap.data()?.blueprintId as string | undefined)
      : undefined;
    dbg.blueprintId = blueprintId ?? null;
    if (blueprintId) {
      const bpSnap = await db.collection("blueprints").doc(blueprintId).get();
      const topics = (bpSnap.data()?.topics ?? []) as Array<{
        pickedQuestionIds?: string[];
      }>;
      const ids = [
        ...new Set(topics.flatMap((t) => t.pickedQuestionIds ?? [])),
      ].slice(0, 200);
      dbg.pickedIdsCount = ids.length;
      let approvedCount = 0;
      const loaded: Question[] = [];
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const snap = await db
          .collection("questions")
          .where(FieldPath.documentId(), "in", chunk)
          .get();
        for (const d of snap.docs) {
          const q = { ...(d.data() as Question), id: d.id };
          loaded.push(q);
          if (q.status === "approved") approvedCount++;
        }
      }
      dbg.fallbackApprovedCount = approvedCount;
      dbg.fallbackLoadedCount = loaded.length;
      // Serve the questions the teacher selected into the blueprint, even
      // if some aren't "approved" — the teacher's selection is the intent,
      // and requiring approval here was silently emptying whole exams.
      full = loaded;
    }
  }

  const questions = full.map(stripForServe);
  dbg.finalCount = questions.length;
  return NextResponse.json({ questions, examFormId, variantId, _debug: dbg });
}
