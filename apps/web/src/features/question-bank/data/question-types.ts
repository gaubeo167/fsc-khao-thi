import {
  ArrowDownUp,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  ListChecks,
  MoveDiagonal,
  Network,
  PencilLine,
  PencilRuler,
  Sparkles,
  TextCursor,
  type LucideIcon,
} from "lucide-react";

export type QuestionType =
  | "mcq-single"
  | "mcq-multi"
  | "true-false"
  | "multi-tf"
  | "fill-blank"
  | "matching"
  | "ordering"
  | "drag-drop"
  | "underline"
  | "short-answer"
  | "essay"
  | "ai-generated";

export interface QuestionTypeMeta {
  id: QuestionType;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** AI-generated is a separate flow — surfaced in TypePicker but not via regular schema. */
  variant?: "standard" | "ai";
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  {
    id: "mcq-single",
    name: "Trắc nghiệm 1 đáp án",
    shortName: "Single Choice",
    description: "Single Choice · 1 đáp án đúng",
    icon: CircleDot,
    color: "#2563EB",
  },
  {
    id: "mcq-multi",
    name: "Trắc nghiệm nhiều đáp án",
    shortName: "Multi Choice",
    description: "Multi Choice · ≥ 2 đáp án đúng",
    icon: CheckSquare,
    color: "#6366F1",
  },
  {
    id: "true-false",
    name: "Đúng / Sai",
    shortName: "True / False",
    description: "True / False · 2 lựa chọn",
    icon: CheckCircle2,
    color: "#10B981",
  },
  {
    id: "multi-tf",
    name: "Đ/S nhiều câu phụ",
    shortName: "Multi T/F",
    description: "Đoạn văn + nhiều câu hỏi Đ/S",
    icon: ListChecks,
    color: "#16A34A",
  },
  {
    id: "fill-blank",
    name: "Điền khuyết",
    shortName: "Fill in blank",
    description: "Fill in blank · Học sinh nhập đáp án",
    icon: PencilRuler,
    color: "#EA580C",
  },
  {
    id: "matching",
    name: "Ghép cặp",
    shortName: "Matching",
    description: "Matching · Nối A-B đúng cặp",
    icon: Network,
    color: "#0D9488",
  },
  {
    id: "ordering",
    name: "Sắp xếp thứ tự",
    shortName: "Ordering",
    description: "Ordering · Kéo thả đúng thứ tự",
    icon: ArrowDownUp,
    color: "#D97706",
  },
  {
    id: "drag-drop",
    name: "Kéo thả",
    shortName: "Drag & Drop",
    description: "Drag & Drop · Thả vào vùng đúng",
    icon: MoveDiagonal,
    color: "#9333EA",
  },
  {
    id: "underline",
    name: "Gạch chân",
    shortName: "Underline",
    description: "Gạch chân từ/cụm từ đúng trong đoạn",
    icon: TextCursor,
    color: "#0EA5E9",
  },
  {
    id: "essay",
    name: "Tự luận",
    shortName: "Essay",
    description: "Essay · Chấm tay theo rubric",
    icon: PencilLine,
    color: "#E11D48",
  },
  {
    id: "ai-generated",
    name: "AI tự sinh câu hỏi",
    shortName: "AI",
    description: "Mô tả chủ đề — AI tạo nhiều câu",
    icon: Sparkles,
    color: "#F59E0B",
    variant: "ai",
  },
];

export function findQuestionType(id: QuestionType): QuestionTypeMeta {
  return QUESTION_TYPES.find((q) => q.id === id) ?? QUESTION_TYPES[0]!;
}
