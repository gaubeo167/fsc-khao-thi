import { z } from "zod";

// Limits are deliberately generous to accommodate embedded images
// (data URL ~50-300KB each) and rich-text markup. The hard cap matters at
// localStorage time, not in the editor.
const BaseFields = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập nội dung câu hỏi")
    .max(2_000_000),
  explanation: z.string().max(2_000_000).optional().default(""),
  subjectId: z.string().min(1, "Vui lòng chọn môn"),
  gradeId: z.string().min(1, "Vui lòng chọn khối"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  tags: z.array(z.string()).default([]),
  kho: z.enum(["personal", "campus"]),
  campusId: z.string().nullable().default(null),
});

const McqOptionSchema = z.object({
  id: z.string(),
  content: z.string().trim().min(1, "Phương án không được trống").max(1_000_000),
  isCorrect: z.boolean(),
});

export const McqSingleSchema = BaseFields.extend({
  type: z.literal("mcq-single"),
  options: z
    .array(McqOptionSchema)
    .min(2, "Tối thiểu 2 phương án")
    .max(8)
    .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
      message: "Phải có đúng 1 phương án đúng",
    }),
});

export const McqMultiSchema = BaseFields.extend({
  type: z.literal("mcq-multi"),
  options: z
    .array(McqOptionSchema)
    .min(2)
    .max(8)
    .refine((opts) => opts.filter((o) => o.isCorrect).length >= 1, {
      message: "Phải có ít nhất 1 phương án đúng",
    }),
});

export const TrueFalseSchema = BaseFields.extend({
  type: z.literal("true-false"),
  correctAnswer: z.boolean(),
});

const MultiTfSubSchema = z.object({
  id: z.string(),
  statement: z.string().trim().min(1, "Câu phụ không được trống").max(2_000_000),
  correctAnswer: z.boolean(),
});

export const MultiTfSchema = BaseFields.extend({
  type: z.literal("multi-tf"),
  subQuestions: z
    .array(MultiTfSubSchema)
    .min(2, "Cần ít nhất 2 câu phụ")
    .max(20),
});

export const ShortAnswerSchema = BaseFields.extend({
  type: z.literal("short-answer"),
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1, "Cần ít nhất 1 đáp án chấp nhận"),
  caseSensitive: z.boolean().default(false),
});

const DragDropZoneSchema = z.object({
  id: z.string(),
  correctContent: z.string().trim().min(1, "Cần nhập đáp án đúng cho vùng").max(500),
});
const DragDropDistractorSchema = z.object({
  id: z.string(),
  content: z.string().trim().min(1, "Cụm từ gây nhiễu không được trống").max(500),
});
export const DragDropSchema = BaseFields.extend({
  type: z.literal("drag-drop"),
  zones: z.array(DragDropZoneSchema).min(1, "Cần ít nhất 1 vùng thả").max(20),
  distractors: z.array(DragDropDistractorSchema).max(30).default([]),
});

const EssayCriterionSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1, "Tiêu chí không được trống").max(200),
  points: z.coerce.number().min(0.5, "Điểm phải ≥ 0.5").max(20).default(1),
});

export const EssaySchema = BaseFields.extend({
  type: z.literal("essay"),
  rubric: z
    .array(EssayCriterionSchema)
    .min(1, "Cần ít nhất 1 tiêu chí chấm")
    .max(20),
  wordMin: z.coerce.number().min(0).max(10000).optional().default(0),
  wordMax: z.coerce.number().min(0).max(10000).optional().default(0),
  aiAssist: z.boolean().default(false),
});

/**
 * Underline (gạch chân) — student picks tokens in a passage that should be
 * underlined. Correct tokens are stored inline in `content` via `[u:phrase]`
 * markers; schema just requires at least one marker is present.
 */
export const UnderlineSchema = BaseFields.extend({
  type: z.literal("underline"),
}).refine((data) => /\[u:[^\]]+\]/.test(data.content), {
  message: "Cần đánh dấu ít nhất 1 cụm gạch chân trong đề bài",
  path: ["content"],
});

const OrderingItemSchema = z.object({
  id: z.string(),
  content: z.string().trim().min(1, "Mục không được trống").max(500),
});

export const OrderingSchema = BaseFields.extend({
  type: z.literal("ordering"),
  items: z.array(OrderingItemSchema).min(2, "Cần ít nhất 2 mục").max(20),
});

const MatchingPairSchema = z.object({
  id: z.string(),
  left: z.string().trim().min(1, "Cột A không được trống").max(500),
  right: z.string().trim().min(1, "Cột B không được trống").max(500),
});

export const MatchingSchema = BaseFields.extend({
  type: z.literal("matching"),
  pairs: z.array(MatchingPairSchema).min(2, "Cần ít nhất 2 cặp").max(20),
});

export const FillBlankSchema = BaseFields.extend({
  type: z.literal("fill-blank"),
  blanks: z
    .array(
      z.object({
        acceptedAnswers: z.array(z.string().trim().min(1)).min(1, "Mỗi blank cần ít nhất 1 đáp án"),
      }),
    )
    .min(1, "Câu hỏi điền cần ít nhất 1 blank"),
});

export const QuestionSchema = z.discriminatedUnion("type", [
  McqSingleSchema,
  McqMultiSchema,
  TrueFalseSchema,
  MultiTfSchema,
  ShortAnswerSchema,
  FillBlankSchema,
  MatchingSchema,
  OrderingSchema,
  DragDropSchema,
  UnderlineSchema,
  EssaySchema,
]);

export type QuestionFormValues = z.infer<typeof QuestionSchema>;
