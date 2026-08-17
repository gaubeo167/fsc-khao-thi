/**
 * POST /api/exam/[shiftId]/regrade
 *
 * Body: { reason: string, syncFromBank?: boolean }
 * Trả:  { ok, total, changed, results: [{ attemptId, before, after }] }
 *
 * Chấm lại TOÀN BỘ bài đã nộp của một ca thi, dùng đúng bộ chấm lúc nộp.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Đề đã đóng băng vào `exam_forms` lúc sinh mã đề — đó là điều đúng: bài thi
 * phải chấm theo đúng cái đã in ra cho học sinh, không phải theo câu hỏi gốc
 * mà ai đó sửa sau. Nhưng nó tạo một ngõ cụt: phát hiện câu SAI ĐÁP ÁN sau
 * kỳ thi thì sửa câu hỏi gốc chẳng thay đổi được gì, và không có đường nào
 * chấm lại. Điểm sai đứng nguyên trong học bạ.
 *
 * ── Cách làm ────────────────────────────────────────────────────────────
 *
 * `syncFromBank` (mặc định BẬT): trước khi chấm, chép lại phần ĐÁP ÁN từ
 * ngân hàng câu hỏi vào bản đóng băng — theo id câu gốc. Chỉ chép đáp án,
 * KHÔNG chép đề bài: đề bài phải giữ nguyên như học sinh đã đọc, sửa nó là
 * viết lại lịch sử. Sửa sai đề bài thì đó là lý do HUỶ CÂU (đặt điểm 0 cho
 * cả lớp hoặc bỏ câu khỏi thang), không phải chấm lại.
 *
 * Mỗi bài lưu lại một dòng lịch sử: điểm trước, điểm sau, ai bấm, lý do, lúc
 * nào. Không có dòng đó thì phụ huynh hỏi "sao điểm con tôi đổi" là không ai
 * trả lời được.
 */
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import type { ExamForm } from "@/features/exam-forms/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import {
  computeAttemptScore,
  computeWeightedAttemptScore,
} from "@/lib/exam/grade";
import { getAdmin } from "@/lib/firebase-admin";

/** Chỉ những trường ĐÁP ÁN được phép làm mới từ ngân hàng. */
function refreshAnswerKey(frozen: Question, live: Question): Question {
  const out = { ...frozen } as unknown as Record<string, unknown>;
  const f = frozen as unknown as Record<string, unknown>;
  const l = live as unknown as Record<string, unknown>;

  if (Array.isArray(f.options) && Array.isArray(l.options)) {
    // Khớp theo THỨ TỰ, không theo id: bản đóng băng có thể đã đảo phương án.
    // Nội dung giữ của bản đóng băng, chỉ lấy cờ đúng/sai theo nội dung khớp.
    const liveByContent = new Map(
      (l.options as Array<{ content: string; isCorrect: boolean }>).map((o) => [
        (o.content ?? "").trim(),
        !!o.isCorrect,
      ]),
    );
    out.options = (f.options as Array<{ content: string; isCorrect: boolean }>).map(
      (o) => ({
        ...o,
        isCorrect: liveByContent.get((o.content ?? "").trim()) ?? o.isCorrect,
      }),
    );
  }
  if (typeof l.correctAnswer === "boolean") out.correctAnswer = l.correctAnswer;
  if (Array.isArray(l.acceptedAnswers)) out.acceptedAnswers = l.acceptedAnswers;
  if (Array.isArray(f.subQuestions) && Array.isArray(l.subQuestions)) {
    const liveByStatement = new Map(
      (l.subQuestions as Array<{ statement: string; correctAnswer: boolean }>).map(
        (s) => [(s.statement ?? "").trim(), !!s.correctAnswer],
      ),
    );
    out.subQuestions = (
      f.subQuestions as Array<{ statement: string; correctAnswer: boolean }>
    ).map((s) => ({
      ...s,
      correctAnswer:
        liveByStatement.get((s.statement ?? "").trim()) ?? s.correctAnswer,
    }));
  }
  if (Array.isArray(l.blanks)) out.blanks = l.blanks;
  if (Array.isArray(l.pairs)) out.pairs = l.pairs;
  if (Array.isArray(l.items)) out.items = l.items;
  if (Array.isArray(l.zones)) out.zones = l.zones;
  return out as unknown as Question;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  // Chấm lại là quyền của giáo viên trở lên — nó đổi điểm của người khác.
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;
  const { uid } = gate.caller;

  let body: { reason?: string; syncFromBank?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const reason = (body.reason ?? "").trim();
  if (reason.length < 5) {
    return NextResponse.json(
      {
        error: "reason_required",
        message: "Cần ghi lý do chấm lại (ít nhất 5 ký tự) — điểm đổi thì phải giải trình được.",
      },
      { status: 400 },
    );
  }
  const syncFromBank = body.syncFromBank !== false;

  const { db } = getAdmin();

  const formsSnap = await db
    .collection("exam_forms")
    .where("shiftId", "==", shiftId)
    .get();
  const formDoc =
    formsSnap.docs.find((d) => (d.data().lifecycle ?? "active") === "active") ??
    formsSnap.docs[0];
  if (!formDoc) {
    return NextResponse.json(
      { error: "no_form", message: "Ca thi này chưa có bản đề đóng băng để chấm lại." },
      { status: 404 },
    );
  }
  const form = { ...(formDoc.data() as ExamForm), id: formDoc.id };

  // Làm mới đáp án từ ngân hàng, ghi thẳng vào bản đóng băng để lần chấm sau
  // (và mọi màn xem lại bài) dùng cùng một sự thật.
  let keysUpdated = 0;
  if (syncFromBank) {
    const ids = new Set<string>();
    for (const v of form.variants ?? []) {
      for (const q of v.questions ?? []) {
        const src = (q as unknown as { sourceQuestionId?: string }).sourceQuestionId;
        ids.add(src ?? (q as unknown as { id: string }).id);
      }
    }
    const live = new Map<string, Question>();
    const all = [...ids].filter(Boolean);
    for (let i = 0; i < all.length; i += 30) {
      const snaps = await Promise.all(
        all.slice(i, i + 30).map((id) => db.collection("questions").doc(id).get()),
      );
      for (const s of snaps) {
        if (s.exists) live.set(s.id, { ...(s.data() as Question), id: s.id });
      }
    }
    const nextVariants = (form.variants ?? []).map((v) => ({
      ...v,
      questions: (v.questions ?? []).map((q) => {
        const src =
          (q as unknown as { sourceQuestionId?: string }).sourceQuestionId ??
          (q as unknown as { id: string }).id;
        const l = live.get(src);
        if (!l) return q;
        keysUpdated += 1;
        return refreshAnswerKey(q as unknown as Question, l) as unknown as typeof q;
      }),
    }));
    form.variants = nextVariants;
    await formDoc.ref.update({
      variants: nextVariants,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // ── Chấm lại từng bài đã nộp ─────────────────────────────────────────
  const attemptsSnap = await db
    .collection("attempts")
    .where("shiftId", "==", shiftId)
    .get();
  const submitted = attemptsSnap.docs.filter(
    (d) => (d.data().submittedAt ?? null) != null,
  );

  const at = new Date().toISOString();
  const results: Array<{
    attemptId: string;
    before: { score: number | null; points: number | null };
    after: { score: number | null; points: number | null };
  }> = [];
  let changed = 0;

  for (const d of submitted) {
    const a = d.data() as Record<string, unknown>;
    const variant =
      (form.variants ?? []).find((v) => v.variantId === a.variantId) ??
      (form.variants ?? [])[0];
    if (!variant) continue;
    const questions = variant.questions as unknown as Question[];
    const answers = (a.answers ?? {}) as Record<string, never>;

    const { score, correctCount, maxScore } = computeAttemptScore(questions, answers);
    const weighted = variant.perQuestion
      ? computeWeightedAttemptScore(
          questions,
          answers,
          (q) => {
            const snapId = (q as unknown as { snapshotId?: string }).snapshotId;
            const w = snapId ? variant.perQuestion?.[snapId] : undefined;
            return typeof w === "number" ? w : 0;
          },
          form.scoringPolicy ?? null,
        )
      : null;

    const before = {
      score: (a.score as number) ?? null,
      points: (a.points as number) ?? null,
    };
    const after = { score, points: weighted?.points ?? null };
    const isChanged = before.score !== after.score || before.points !== after.points;
    if (isChanged) changed += 1;

    // Lưu lịch sử NGAY TRÊN bài làm: mở bài ra là thấy điểm từng đổi thế nào,
    // không phải đi tra một bảng khác.
    const entry = {
      at,
      by: uid,
      reason,
      before,
      after,
    };
    await d.ref.update({
      score,
      maxScore,
      correctCount,
      ...(weighted
        ? {
            points: weighted.points,
            maxPoints: weighted.maxPoints,
            perQuestionPoints: weighted.perQuestion,
            earnedPerQuestion: weighted.earnedPerQuestion,
          }
        : {}),
      regradeHistory: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
    });
    results.push({ attemptId: d.id, before, after });
  }

  return NextResponse.json({
    ok: true,
    total: submitted.length,
    changed,
    keysUpdated,
    results,
  });
}
