/**
 * POST /api/exam/[shiftId]/violation
 *
 * Body: { kind: "tabSwitches" | "fullscreenExits" | "pasteAttempts", at?: string }
 *        (vẫn nhận lối viết số ít cũ: "tabSwitch" | "fullscreenExit" | "pasteAttempt")
 *
 * Ghi một vi phạm chống gian lận vào bài làm của CHÍNH người gọi, bằng Admin
 * SDK, chỉ CỘNG DỒN (FieldValue.increment) và chỉ NỐI THÊM vào nhật ký.
 *
 * Vì sao cần route này: trước đây client tự `patchDoc(attempts/…, {violations})`,
 * và rules phải cho học sinh ghi trường đó. Nghĩa là chính người bị giám sát
 * đặt lại được `tabSwitches: 0` trong devtools trước khi nộp — bằng chứng
 * chống gian lận do bên bị giám sát cầm bút. Server ghi thì học sinh chỉ có
 * thể LÀM TĂNG số vi phạm của mình, không giảm.
 */
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { verifyCaller } from "@/lib/api-auth";
import { getAdmin } from "@/lib/firebase-admin";

/**
 * Chuẩn hoá `kind` về đúng tên trường trong `attempts.violations`.
 *
 * Nhận CẢ hai lối viết: client (`attempts-store.recordViolation`) gửi tên
 * trường số nhiều — `tabSwitches` — còn bản đầu của route này chỉ nhận số
 * ít. Lệch nhau nên MỌI lần ghi vi phạm bị trả 400 `bad_kind`, và vì fetch
 * không ném lỗi ở 4xx nên client nuốt luôn: đếm vi phạm chỉ tăng trong máy
 * HS, phòng giám sát không thấy gì. Nhận cả hai để bản cũ đang chạy không
 * gãy, nhưng LƯU thì chỉ lưu một dạng số nhiều — đúng khoá mà màn giám sát
 * tra nhãn (`VIOLATION_LABEL`).
 */
const KINDS = {
  tabSwitch: "tabSwitches",
  fullscreenExit: "fullscreenExits",
  pasteAttempt: "pasteAttempts",
  tabSwitches: "tabSwitches",
  fullscreenExits: "fullscreenExits",
  pasteAttempts: "pasteAttempts",
} as const;

type Kind = keyof typeof KINDS;

/** Chặn nhật ký phình vô hạn nếu client lỗi và bắn liên tục. */
const MAX_EVENTS = 200;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const { shiftId } = await ctx.params;
  const gate = await verifyCaller(req, {});
  if ("error" in gate) return gate.error;
  const { uid } = gate.caller;

  let body: { kind?: string; at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body không hợp lệ." },
      { status: 400 },
    );
  }
  const kind = body?.kind as Kind | undefined;
  if (!kind || !(kind in KINDS)) {
    return NextResponse.json(
      { error: "bad_kind", message: "kind phải là tabSwitch | fullscreenExit | pasteAttempt." },
      { status: 400 },
    );
  }

  const { db } = getAdmin();
  // Id bài làm suy ra từ uid người gọi → không ghi được vào bài của người khác.
  const ref = db.collection("attempts").doc(`att-${shiftId}-${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "not_found", message: "Chưa có bài làm cho ca thi này." },
      { status: 404 },
    );
  }
  // Đã nộp thì không nhận thêm — tránh bơm nhiễu vào hồ sơ sau khi thi xong.
  if ((snap.data()?.submittedAt ?? null) != null) {
    return NextResponse.json(
      { error: "already_submitted", message: "Bài đã nộp." },
      { status: 409 },
    );
  }

  const at = typeof body.at === "string" ? body.at : new Date().toISOString();
  const events = (snap.data()?.recentEvents as unknown[]) ?? [];
  // Ghi tên trường đã chuẩn hoá, KHÔNG ghi `kind` thô của request: màn giám
  // sát tra `VIOLATION_LABEL[ev.kind]` bằng khoá số nhiều, lưu "tabSwitch"
  // thì dòng sự kiện hiện nhãn rỗng.
  const canonical = KINDS[kind];
  await ref.update({
    [`violations.${canonical}`]: FieldValue.increment(1),
    recentEvents: [...events, { kind: canonical, at }].slice(-MAX_EVENTS),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
