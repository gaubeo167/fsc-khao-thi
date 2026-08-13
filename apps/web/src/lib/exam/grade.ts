/**
 * Pure auto-grading logic — shared by the client (demo mode) and the
 * server-authoritative submit route (/api/exam/[shiftId]/submit).
 *
 * NO client-only deps (no zustand/react), so it can run in a route
 * handler with the Admin SDK. Answer/Question are type-only imports
 * (erased at compile), so importing from the "use client" attempts-store
 * pulls no runtime client code.
 *
 * `score` is a 0–100 PERCENT (correct / auto-gradable-count × 100),
 * `maxScore` is the auto-gradable question COUNT — matching the historical
 * representation the rest of the app already reads (see compute-progress
 * and the result page).
 */

import type { Question } from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";

import { matchShortAnswer } from "./short-answer-match";

export function gradeQuestion(
  q: Question,
  a: Answer | undefined,
): { points: number; correct: boolean } | null {
  if (!a) return { points: 0, correct: false };
  switch (q.type) {
    case "mcq-single": {
      if (a.kind !== "mcq-single" || !a.optionId) return { points: 0, correct: false };
      const correct = q.options.find((o) => o.isCorrect)?.id;
      return correct === a.optionId
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "mcq-multi": {
      if (a.kind !== "mcq-multi") return { points: 0, correct: false };
      const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
      const chosen = new Set(a.optionIds);
      const same =
        chosen.size === correctIds.size &&
        Array.from(correctIds).every((id) => chosen.has(id));
      return same ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "true-false": {
      if (a.kind !== "true-false" || a.value == null) return { points: 0, correct: false };
      return a.value === q.correctAnswer
        ? { points: 1, correct: true }
        : { points: 0, correct: false };
    }
    case "short-answer": {
      if (a.kind !== "short-answer") return { points: 0, correct: false };
      // So khớp nằm ở module dùng chung với bộ chấm thi thử: chuẩn hoá số
      // (0,25 = 0.25 = 1/4), ký tự đại diện *, và % điểm từng đáp án.
      const m = matchShortAnswer(a.text, q.acceptedAnswers, q.caseSensitive);
      return { points: m.ratio, correct: m.ratio >= 1 };
    }
    case "fill-blank": {
      if (a.kind !== "fill-blank") return { points: 0, correct: false };
      const allOk = q.blanks.every((b, i) => {
        const guess = (a.blanks[i] ?? "").trim().toLowerCase();
        return b.acceptedAnswers.map((s) => s.trim().toLowerCase()).includes(guess);
      });
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "multi-tf": {
      if (a.kind !== "multi-tf") return { points: 0, correct: false };
      const allOk = q.subQuestions.every((sub) => a.values[sub.id] === sub.correctAnswer);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "matching": {
      if (a.kind !== "matching") return { points: 0, correct: false };
      const allOk = q.pairs.every((p) => a.pairings[p.id] === p.id);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "ordering": {
      if (a.kind !== "ordering") return { points: 0, correct: false };
      const correct = q.items.map((it) => it.id);
      const allOk =
        a.orderedIds.length === correct.length &&
        a.orderedIds.every((id, i) => id === correct[i]);
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "drag-drop": {
      if (a.kind !== "drag-drop") return { points: 0, correct: false };
      const norm = (s: string) => s.trim().toLowerCase();
      const allOk = q.zones.every((z, i) => norm(a.zones[i] ?? "") === norm(z.correctContent));
      return allOk ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    case "underline": {
      if (a.kind !== "underline") return { points: 0, correct: false };
      const correctSet = new Set<string>();
      const re = /\[u:([^\]\n]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.content)) != null) {
        correctSet.add(m[1]!.trim().toLowerCase());
      }
      const studentSet = new Set(a.underlinedPhrases.map((p) => p.trim().toLowerCase()));
      const exactMatch =
        studentSet.size === correctSet.size &&
        Array.from(correctSet).every((p) => studentSet.has(p));
      return exactMatch ? { points: 1, correct: true } : { points: 0, correct: false };
    }
    // Essay / AI-generated are manually graded → excluded from auto-score.
    case "essay":
    case "ai-generated":
      return null;
    default:
      return null;
  }
}

/**
 * Deterministic Fisher–Yates shuffle keyed by a stable string. Same seed
 * → same order (idempotent across refetch), but the order does NOT match
 * the authored array — which is exactly what hides a "correct order"
 * answer. NOT crypto; only needs to be non-obvious to a student reading
 * the JSON. Grading always uses the ORIGINAL question, so shuffling the
 * served copy never affects the score.
 */
function seededShuffle<T>(arr: readonly T[], seedStr: string): T[] {
  let s = 0;
  for (const ch of seedStr) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Return a DISPLAY-SAFE copy of a question with the answer key removed,
 * for serving to a student who is taking (not reviewing) the exam.
 *
 * Fully stripped:
 *   • mcq-single/multi (isCorrect→false), true-false & multi-tf
 *     (correctAnswer→false), short-answer & fill-blank (acceptedAnswers→[]).
 *   • ordering — items shuffled so the served array no longer encodes the
 *     correct order (the answer WAS the array order).
 *   • drag-drop — zone `correctContent` blanked; the pool of chips (correct
 *     contents + distractors, merged & shuffled, unlabelled) is moved to
 *     `pool` so the student can still play without seeing which chip maps
 *     to which zone.
 * Essay/ai-generated have no auto key.
 *
 * ⚠️ STILL structural (tracked follow-up, needs a deeper redesign):
 *   matching (right bundled with left, ids shared → needs opaque-id remap
 *   + submit translation) and underline ([u:] markers double as both the
 *   answer AND the clickable-phrase grouping → needs decoy chunks). These
 *   pass through unchanged for now.
 */
export function stripAnswers(q: Question): Question {
  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return { ...q, options: q.options.map((o) => ({ ...o, isCorrect: false })) };
    case "true-false":
      return { ...q, correctAnswer: false };
    case "short-answer":
      return { ...q, acceptedAnswers: [] };
    case "fill-blank":
      return { ...q, blanks: q.blanks.map(() => ({ acceptedAnswers: [] })) };
    case "multi-tf":
      return {
        ...q,
        subQuestions: q.subQuestions.map((s) => ({ ...s, correctAnswer: false })),
      };
    case "ordering":
      return { ...q, items: seededShuffle(q.items, `ord-${q.id}`) };
    case "drag-drop": {
      const pool = seededShuffle(
        [
          ...q.zones.map((z) => z.correctContent),
          ...q.distractors.map((d) => d.content),
        ],
        `dd-${q.id}`,
      );
      return {
        ...q,
        zones: q.zones.map((z) => ({ ...z, correctContent: "" })),
        distractors: [],
        pool,
      };
    }
    // TODO(harden): matching & underline still leak (see warning above).
    default:
      return q;
  }
}

export interface AutoScore {
  /** 0–100 percent over auto-gradable questions. */
  score: number;
  correctCount: number;
  /** Count of auto-gradable questions. */
  maxScore: number;
}

export function computeAttemptScore(
  questions: Question[],
  answers: Record<string, Answer>,
): AutoScore {
  let correctCount = 0;
  let scored = 0;
  let max = 0;
  for (const q of questions) {
    const result = gradeQuestion(q, answers[q.id]);
    if (result == null) continue; // essay/ai — manual
    max += 1;
    if (result.correct) correctCount += 1;
    scored += result.points;
  }
  const score = max > 0 ? Math.round((scored / max) * 100) : 0;
  return { score, correctCount, maxScore: max };
}

/* ─────────────── Chấm theo THANG ĐIỂM CỦA ĐỀ (MOET) ───────────────
 *
 * `computeAttemptScore` ở trên cho mỗi câu 1 điểm rồi quy phần trăm — đúng
 * cho "bao nhiêu câu đúng", SAI khi đề có thang riêng (đề YCCĐ: Phần I mcq
 * 0,25đ/câu, Phần II Đúng–Sai 1đ/câu…). Điểm/câu thật đã được đóng băng vào
 * `ExamFormVariant.perQuestion` lúc tạo ca thi; phần dưới chấm theo đúng bản
 * đóng băng đó, cộng ngữ nghĩa chấm từng phần của `ScoringPolicy`.
 */

/** Phần điểm đạt được của MỘT câu, tính theo tỉ lệ 0..1 của điểm câu đó.
 *  `null` = câu chấm tay (tự luận) — không tính vào điểm máy. */
export function gradeQuestionRatio(
  q: Question,
  a: Answer | undefined,
  policy?: ScoringPolicyLike | null,
): number | null {
  if (q.type === "essay" || q.type === "ai-generated") return null;

  // Đúng–Sai chùm: MOET chấm LŨY TIẾN theo số ý đúng (1 ý 0,1đ · 2 ý 0,25đ ·
  // 3 ý 0,5đ · 4 ý 1đ với câu 1 điểm). Bảng là điểm tuyệt đối cho câu đủ ý,
  // nên quy về tỉ lệ = bảng[k] / bảng[tổng số ý] để vẫn đúng khi điểm/câu khác 1.
  if (q.type === "multi-tf" && policy && policy.ds !== "full") {
    if (!a || a.kind !== "multi-tf") return 0;
    const subs = q.subQuestions ?? [];
    if (subs.length === 0) return 0;
    const rightCount = subs.filter((s) => a.values[s.id] === s.correctAnswer).length;
    if (policy.ds === "weighted") {
      // Trọng số từng ý (mặc định đều nhau khi không đặt).
      const totalW = subs.reduce((n, s) => n + (s.weight ?? 1), 0);
      if (totalW <= 0) return 0;
      const gotW = subs.reduce(
        (n, s) => n + (a.values[s.id] === s.correctAnswer ? s.weight ?? 1 : 0),
        0,
      );
      return gotW / totalW;
    }
    const table = policy.dsGraduatedTable ?? { 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 };
    const full = table[subs.length] ?? Math.max(...Object.values(table), 1);
    if (full <= 0) return 0;
    return Math.min(1, (table[rightCount] ?? 0) / full);
  }

  // MCQ nhiều đáp án chấm TỪNG PHẦN — công thức đã chốt trong ScoringPolicy:
  // max(0, (số đúng − số sai) / số đáp án đúng). Chọn bừa thêm 1 đáp án sai
  // là trừ đi 1 phần, chọn hết thì về 0. Trùng công thức bộ chấm thi thử.
  if (q.type === "mcq-multi" && policy?.mcqMulti === "partial") {
    if (!a || a.kind !== "mcq-multi") return 0;
    const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    if (correctIds.size === 0) return 0;
    let hits = 0;
    let misses = 0;
    for (const id of new Set(a.optionIds ?? [])) {
      if (correctIds.has(id)) hits += 1;
      else misses += 1;
    }
    return Math.max(0, (hits - misses) / correctIds.size);
  }

  const r = gradeQuestion(q, a);
  if (r == null) return null;
  // `points` của gradeQuestion là 0..1 (trả lời ngắn có thể ăn một phần theo
  // % đáp án). Ép về 0/1 ở đây là xoá mất điểm từng phần vừa tính.
  return Math.min(1, Math.max(0, r.points));
}

/** Chỉ những trường của ScoringPolicy mà bộ chấm cần (tránh phụ thuộc vòng). */
export interface ScoringPolicyLike {
  mcqMulti: "full" | "partial";
  ds: "graduated" | "weighted" | "full";
  dsGraduatedTable?: Record<number, number>;
}

export interface WeightedAttemptScore {
  /** Điểm máy chấm được, theo thang của đề. */
  points: number;
  /** Tổng điểm tối đa của các câu máy chấm được (chưa gồm tự luận). */
  maxPoints: number;
  /** Điểm TỐI ĐA từng câu (khoá theo id câu hỏi). */
  perQuestion: Record<string, number>;
  /** Điểm ĐẠT ĐƯỢC từng câu — màn kết quả chỉ hiển thị, không tính lại, nên
   *  học sinh và giáo viên luôn thấy đúng con số server đã chấm. */
  earnedPerQuestion: Record<string, number>;
  correctCount: number;
  autoGradedCount: number;
}

/**
 * Chấm cả bài theo thang điểm của đề.
 * `weightOf` trả điểm tối đa của một câu (lấy từ `variant.perQuestion`).
 */
export function computeWeightedAttemptScore(
  questions: Question[],
  answers: Record<string, Answer>,
  weightOf: (q: Question) => number,
  policy?: ScoringPolicyLike | null,
): WeightedAttemptScore {
  let points = 0;
  let maxPoints = 0;
  let correctCount = 0;
  let autoGradedCount = 0;
  const perQuestion: Record<string, number> = {};
  const earnedPerQuestion: Record<string, number> = {};
  for (const q of questions) {
    const w = weightOf(q);
    perQuestion[q.id] = round2(w);
    const ratio = gradeQuestionRatio(q, answers[q.id], policy);
    if (ratio == null) continue; // tự luận — chấm tay
    autoGradedCount += 1;
    maxPoints += w;
    points += w * ratio;
    earnedPerQuestion[q.id] = round2(w * ratio);
    if (ratio >= 1) correctCount += 1;
  }
  return {
    points: round2(points),
    maxPoints: round2(maxPoints),
    perQuestion,
    earnedPerQuestion,
    correctCount,
    autoGradedCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
