/**
 * POST /api/exam/[shiftId]/audio-play
 *
 * Body: { questionId: string, index: number, maxPlays: number }
 * Trả:  { ok: true, plays } khi còn lượt · 409 { error: "out_of_plays" } khi hết
 *
 * Tiêu MỘT lượt nghe của một bài audio trong bài làm của CHÍNH người gọi.
 *
 * ── Vì sao đếm ở server ─────────────────────────────────────────────────
 *
 * Đếm ở trình duyệt thì học sinh chỉ cần F5 là bộ đếm về 0. Đếm rồi lưu vào
 * bài làm bằng đường ghi của client cũng không khá hơn: rules cho học sinh
 * ghi `answers`/`markedForReview`, nên mở devtools là sửa được luôn số lượt.
 * Giới hạn kiểu đó là giới hạn trang trí.
 *
 * Cùng lý do và cùng cách làm với `violation/route.ts`: Admin SDK ghi, chỉ
 * CỘNG DỒN, và `audioPlays` KHÔNG nằm trong danh sách trường học sinh được
 * ghi. Học sinh chỉ có thể làm TĂNG số lượt đã dùng của chính mình.
 *
 * Việc kiểm "còn lượt không" cũng nằm ở đây chứ không ở client: client giữ
 * quyền quyết thì sửa `left` trong devtools là nghe lại được.
 */
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import { getAdmin } from "@/lib/firebase-admin";

/** Trần lượt cho một bài — chặn client lỗi bắn liên tục làm phình document. */
const MAX_SANE_PLAYS = 100;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid } = gate.caller;

  let body: { questionId?: string; index?: number; maxPlays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body không hợp lệ." },
      { status: 400 },
    );
  }
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const index = Number.isInteger(body.index) ? (body.index as number) : -1;
  const maxPlays = Number.isInteger(body.maxPlays) ? (body.maxPlays as number) : 0;
  if (!questionId || index < 0 || maxPlays < 1 || maxPlays > MAX_SANE_PLAYS) {
    return NextResponse.json(
      { error: "bad_request", message: "Thiếu questionId / index / maxPlays." },
      { status: 400 },
    );
  }

  const { db } = getAdmin();
  // Id bài làm suy ra từ uid người gọi → không tiêu được lượt của người khác.
  const ref = db.collection("attempts").doc(`att-${shiftId}-${uid}`);

  // Giao dịch: hai lần bấm gần nhau mà đọc–ghi rời nhau thì cả hai cùng thấy
  // "còn 1 lượt" và cùng được phát — nghe thành 2 lần trong khi chỉ trừ 1.
  const key = `${questionId}#${index}`;
  try {
    const plays = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("not_found");
      if ((snap.data()?.submittedAt ?? null) != null) throw new Error("already_submitted");
      const used = Number(
        (snap.data()?.audioPlays as Record<string, number> | undefined)?.[key] ?? 0,
      );
      if (used >= maxPlays) throw new Error("out_of_plays");
      tx.update(ref, {
        [`audioPlays.${key}`]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return used + 1;
    });
    return NextResponse.json({ ok: true, plays });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown";
    if (code === "not_found") {
      return NextResponse.json(
        { error: "not_found", message: "Chưa có bài làm cho ca thi này." },
        { status: 404 },
      );
    }
    if (code === "already_submitted") {
      return NextResponse.json(
        { error: "already_submitted", message: "Bài đã nộp." },
        { status: 409 },
      );
    }
    if (code === "out_of_plays") {
      return NextResponse.json(
        { error: "out_of_plays", message: "Đã hết lượt nghe của bài này." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "server_error", message: "Không ghi được lượt nghe." },
      { status: 500 },
    );
  }
}
