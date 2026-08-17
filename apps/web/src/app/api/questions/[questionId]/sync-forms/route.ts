/**
 * POST /api/questions/[questionId]/sync-forms
 *
 * Body: { reason?: string }
 * Trả:  { ok, formsUpdated, shiftIds, questionsUpdated, structureChanged }
 *
 * Đẩy bản mới nhất của một câu hỏi vào MỌI đề đang sống có chứa nó.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────
 *
 * Đề được đóng băng vào `exam_forms` lúc sinh mã đề, và cả hai đầu đều đọc
 * bản đóng băng đó — route phục vụ câu hỏi cho học sinh lẫn route chấm bài.
 * Ngân hàng câu hỏi không tham gia.
 *
 * Nên sửa đáp án trong ngân hàng xong thì ca thi đang diễn ra vẫn chấm bằng
 * đáp án cũ. Người dùng gặp đúng vậy: "tôi đã sửa đáp án câu hỏi nhưng học
 * sinh vào làm sau thì chọn đáp án như tôi đã sửa vẫn bị báo sai". Mỗi em
 * vào sau lại ăn thêm một lần lỗi.
 *
 * ── Ranh giới ───────────────────────────────────────────────────────────
 *
 * Route này KHÔNG đụng tới bài đã nộp. Điểm đã chấm chỉ đổi khi bấm "Chấm
 * lại ca thi" — có ghi lý do và lưu lịch sử. Ở đây chỉ sửa cái đề mà những
 * lượt thi TIẾP THEO sẽ đọc.
 *
 * Chỉ đề `lifecycle == "active"`. Đề đã lưu trữ là minh chứng của kỳ thi đã
 * khép lại, viết vào đó là viết lại lịch sử.
 */
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import type { ExamForm } from "@/features/exam-forms/data/types";
import {
  bankIdOfSnapshot,
  refreshFrozenQuestion,
} from "@/lib/exam/refresh-frozen";
import { getAdmin } from "@/lib/firebase-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await ctx.params;
  const gate = await verifyCaller(req, { staffOnly: true });
  if ("error" in gate) return gate.error;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { db } = getAdmin();

  const liveSnap = await db.collection("questions").doc(questionId).get();
  if (!liveSnap.exists) {
    return NextResponse.json(
      { error: "not_found", message: `Không tìm thấy câu hỏi ${questionId}.` },
      { status: 404 },
    );
  }
  const live = { ...(liveSnap.data() as Record<string, unknown>), id: liveSnap.id };

  // Không có chỉ mục nào cho id câu nằm sâu trong `variants[].questions[]`,
  // nên phải quét. Chỉ quét đề đang sống — số này nhỏ và có trần rõ ràng.
  const formsSnap = await db
    .collection("exam_forms")
    .where("lifecycle", "==", "active")
    .get();

  let formsUpdated = 0;
  let questionsUpdated = 0;
  let structureChanged = false;
  const shiftIds: string[] = [];

  for (const doc of formsSnap.docs) {
    const form = doc.data() as ExamForm;
    let touched = false;
    const nextVariants = (form.variants ?? []).map((v) => ({
      ...v,
      questions: (v.questions ?? []).map((q) => {
        const snap = q as unknown as Record<string, unknown>;
        if (bankIdOfSnapshot(snap) !== questionId) return q;
        const res = refreshFrozenQuestion(snap, live);
        if (!res.changed) return q;
        touched = true;
        questionsUpdated += 1;
        if (res.structureChanged) structureChanged = true;
        return res.next as unknown as typeof q;
      }),
    }));
    if (!touched) continue;
    await doc.ref.update({
      variants: nextVariants,
      updatedAt: FieldValue.serverTimestamp(),
      lastSyncedFromBank: {
        at: new Date().toISOString(),
        by: gate.caller.uid,
        questionId,
        reason: body.reason ?? null,
      },
    });
    formsUpdated += 1;
    if (form.shiftId) shiftIds.push(form.shiftId);
  }

  return NextResponse.json({
    ok: true,
    formsUpdated,
    questionsUpdated,
    structureChanged,
    shiftIds: [...new Set(shiftIds)],
  });
}
