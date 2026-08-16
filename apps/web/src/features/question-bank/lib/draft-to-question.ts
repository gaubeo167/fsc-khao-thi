/**
 * `DraftQuestion` (đã chỉnh trong màn nhập) → bản ghi `Question` ghi vào kho.
 *
 * Tách khỏi dialog vì đây là chỗ DỄ HỎNG NHẤT của cả luồng nhập: sai ánh xạ
 * thì câu hỏi méo vào thẳng ngân hàng, và không có màn nào phát hiện hộ. Để
 * ở một hàm thuần thì test được mà không cần dựng UI.
 *
 * Ánh xạ giữ nguyên hành vi của dialog "Upload đề theo mã" cũ — cố ý không
 * cải tiến gì ở đây, để lần gộp này không đổi dữ liệu đầu ra.
 */

import type { Question, QuestionStatus } from "../data/seed-questions";

import type { DraftQuestion } from "./import-draft";

export interface SaveContext {
  subjectId: string;
  gradeId: string;
  /** Mục lục = CHỖ CẤT câu hỏi, người dùng chọn, có thể để trống. */
  tocNodeId: string | null;
  /** Bloom suy từ node khung năng lực khớp mã, nếu có. */
  bloomLevel?: 1 | 2 | 3 | null;
  ownerId: string;
  ownerName: string;
  campusId: string | null;
  kho: "personal" | "campus";
  status: QuestionStatus;
}

type NewQuestion = Omit<Question, "id" | "createdAt" | "updatedAt">;

/**
 * Trả `null` khi dạng câu chưa được chọn hoặc chưa hỗ trợ ghi — người gọi
 * PHẢI coi `null` là "đừng ghi câu này", không được rơi về một dạng mặc định.
 */
export function draftToQuestion(
  q: DraftQuestion,
  ctx: SaveContext,
): NewQuestion | null {
  if (!q.type || !q.difficulty) return null;

  const base = {
    content: q.content,
    explanation: q.explanation?.trim() ? q.explanation : undefined,
    subjectId: ctx.subjectId,
    gradeId: ctx.gradeId,
    tocNodeId: ctx.tocNodeId,
    // Mã trong file trỏ tới YCCĐ của khung năng lực → gắn thẳng vào câu hỏi,
    // nhờ đó bước ① của "Tạo đề theo YCCĐ" đếm được ngay.
    competencyIds: q.chuyenDeId ? [q.chuyenDeId] : undefined,
    // Bloom đi kèm YCCĐ đã khớp. Trước đây chỉ đọc `ctx.bloomLevel` mà dialog
    // không bao giờ truyền, nên mọi câu nhập từ file đều mất mức nhận thức —
    // đúng cái trục mà ma trận "Tạo đề theo YCCĐ" đếm theo.
    bloomLevel: q.bloomLevel ?? ctx.bloomLevel ?? undefined,
    difficulty: q.difficulty,
    tags: [] as string[],
    kho: ctx.kho,
    campusId: ctx.campusId,
    ownerId: ctx.ownerId,
    ownerName: ctx.ownerName,
    status: ctx.status,
    approvedBy: ctx.status === "approved" ? ctx.ownerId : null,
    rejectionNote: null,
  };

  switch (q.type) {
    case "mcq-single":
    case "mcq-multi":
      return {
        ...base,
        type: q.type,
        options: q.options.map((o, i) => ({
          id: `o${i + 1}`,
          content: o.content,
          isCorrect: o.isCorrect,
        })),
      } as NewQuestion;
    case "multi-tf":
      return {
        ...base,
        type: "multi-tf",
        subQuestions: q.subQuestions.map((s, i) => ({
          id: `s${i + 1}`,
          statement: s.statement,
          correctAnswer: s.correctAnswer,
        })),
      } as NewQuestion;
    case "short-answer":
      return {
        ...base,
        type: "short-answer",
        acceptedAnswers: q.acceptedAnswers,
        caseSensitive: false,
      } as NewQuestion;
    case "true-false":
      // `null` = file không ghi đáp án. `validateDraft` đã chặn ở đường gửi
      // duyệt; ở đường lưu nháp thì thà không ghi câu còn hơn ghi "Sai".
      if (q.correctAnswer == null) return null;
      return {
        ...base,
        type: "true-false",
        correctAnswer: q.correctAnswer,
      } as NewQuestion;
    case "fill-blank":
      return {
        ...base,
        type: "fill-blank",
        blanks: q.blanks.map((b) => ({ acceptedAnswers: b.acceptedAnswers })),
      } as NewQuestion;
    case "matching":
      return {
        ...base,
        type: "matching",
        pairs: q.pairs.map((p, i) => ({
          id: `p${i + 1}`,
          left: p.left,
          right: p.right,
        })),
        distractors: q.distractors.map((d, i) => ({
          id: `md${i + 1}`,
          right: d,
        })),
      } as NewQuestion;
    case "ordering":
      return {
        ...base,
        type: "ordering",
        items: q.items.map((content, i) => ({ id: `i${i + 1}`, content })),
      } as NewQuestion;
    case "drag-drop":
      return {
        ...base,
        type: "drag-drop",
        zones: q.zones.map((correctContent, i) => ({
          id: `z${i + 1}`,
          correctContent,
        })),
        distractors: q.distractors.map((content, i) => ({
          id: `dd${i + 1}`,
          content,
        })),
      } as NewQuestion;
    case "underline":
      // Đáp án nằm trong `content` dưới dạng mốc [u:…] — không có trường riêng.
      return { ...base, type: "underline" } as NewQuestion;
    case "essay":
      return {
        ...base,
        type: "essay",
        rubric: [],
        aiAssist: false,
      } as NewQuestion;
    default:
      // Dạng parser đọc ra nhưng luồng nhập chưa ghi được (ai-generated).
      // Trả null thay vì ép về mcq — ép là làm hỏng câu một cách im lặng.
      return null;
  }
}
