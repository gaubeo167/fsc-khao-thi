/**
 * MỘT luật duy nhất cho điểm CÂU NHÓM (1 đề bài + nhiều câu hỏi phụ).
 *
 * ── Luật ────────────────────────────────────────────────────────────────
 *
 * Mỗi ý phụ tự chấm theo dạng của nó (1 đáp án / nhiều đáp án / trả lời
 * ngắn), ra một tỉ lệ 0..1. Điểm của cả cụm là TRUNG BÌNH các ý — tức mỗi ý
 * nặng bằng nhau. Bài đọc 8 câu thì mỗi câu một phần tám của cụm.
 *
 * Cụm không phải "một câu lẻ": khi chia điểm cho cả đề, cụm nặng bằng SỐ Ý
 * của nó (`questionSlots` trong `features/exam-shifts/lib/scoring.ts`). Ghép
 * hai chỗ đó lại thì mỗi ý phụ ăn đúng bằng một câu trắc nghiệm thường —
 * đúng như đề đọc hiểu tiếng Anh vẫn tính.
 *
 * ── Vì sao lại là một file riêng ────────────────────────────────────────
 *
 * Dự án có HAI bộ chấm chạy song song (`lib/exam/grade.ts` cho ca thi thật,
 * `features/exams/lib/grade.ts` cho thi thử) và chúng đã từng lạc nhau ở
 * mcq-multi và multi-tf. Luật multi-tf sau đó phải gom về `ds-score.ts`.
 * Dạng mới đi thẳng vào khuôn đó: một file, hai bộ chấm cùng gọi.
 *
 * ── Ba bất biến ─────────────────────────────────────────────────────────
 *
 *   1. Đúng hết ý → 1. Không đúng ý nào → 0.
 *   2. Làm đúng nhiều ý hơn thì KHÔNG BAO GIỜ được ít điểm hơn.
 *   3. Ý chưa trả lời tính 0, không làm hỏng các ý khác.
 */

import { matchShortAnswer, type ShortAnswerKey } from "./short-answer-match";

/** Ý phụ, rút gọn còn đúng phần bộ chấm cần. */
export interface GroupSubLike {
  id: string;
  type: "mcq-single" | "mcq-multi" | "short-answer";
  options?: Array<{ id: string; isCorrect: boolean }>;
  acceptedAnswers?: ShortAnswerKey[];
  caseSensitive?: boolean;
}

/** Bài làm của một ý phụ — cùng hình dạng với `Answer` của dạng tương ứng. */
export type GroupSubAnswer =
  | { kind: "mcq-single"; optionId: string | null }
  | { kind: "mcq-multi"; optionIds: string[] }
  | { kind: "short-answer"; text: string }
  | { kind: string; [k: string]: unknown };

export interface GroupPolicyLike {
  /** Chấm ý "nhiều đáp án": toàn phần hay từng phần. Không cài = toàn phần,
   *  giống hệt mặc định của câu mcq-multi đứng một mình. */
  mcqMulti?: "full" | "partial";
}

/** Tỉ lệ điểm (0..1) của MỘT ý phụ. */
export function groupSubRatio(
  sub: GroupSubLike,
  a: GroupSubAnswer | undefined,
  policy?: GroupPolicyLike | null,
): number {
  if (!a) return 0;

  if (sub.type === "short-answer") {
    if (a.kind !== "short-answer") return 0;
    const text = typeof a.text === "string" ? a.text : "";
    return clamp01(
      matchShortAnswer(text, sub.acceptedAnswers, sub.caseSensitive ?? false).ratio,
    );
  }

  const correctIds = new Set(
    (sub.options ?? []).filter((o) => o.isCorrect).map((o) => o.id),
  );
  if (correctIds.size === 0) return 0;

  if (sub.type === "mcq-single") {
    if (a.kind !== "mcq-single") return 0;
    const chosen = (a as { optionId?: string | null }).optionId;
    return chosen != null && correctIds.has(chosen) ? 1 : 0;
  }

  // mcq-multi
  if (a.kind !== "mcq-multi") return 0;
  const chosen = new Set((a as { optionIds?: string[] }).optionIds ?? []);
  if (policy?.mcqMulti === "partial") {
    // Cùng công thức với câu mcq-multi đứng một mình:
    // max(0, (số đúng − số sai) / số đáp án đúng).
    let hits = 0;
    let misses = 0;
    for (const id of chosen) (correctIds.has(id) ? hits++ : misses++);
    return clamp01((hits - misses) / correctIds.size);
  }
  const same =
    chosen.size === correctIds.size &&
    [...correctIds].every((id) => chosen.has(id));
  return same ? 1 : 0;
}

/** Tỉ lệ điểm (0..1) của cả cụm — trung bình các ý. */
export function groupRatio(
  subs: readonly GroupSubLike[],
  answers: Record<string, GroupSubAnswer> | undefined,
  policy?: GroupPolicyLike | null,
): number {
  if (subs.length === 0) return 0;
  let sum = 0;
  for (const sub of subs) sum += groupSubRatio(sub, answers?.[sub.id], policy);
  return clamp01(sum / subs.length);
}

/** Đúng HẾT ý mới tính là "câu đúng" — cột "số câu đúng" giữ nguyên nghĩa. */
export function groupAllCorrect(
  subs: readonly GroupSubLike[],
  answers: Record<string, GroupSubAnswer> | undefined,
): boolean {
  if (subs.length === 0) return false;
  return subs.every((sub) => groupSubRatio(sub, answers?.[sub.id]) >= 1);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
