import type { QuestionType } from "./question-types";

export type Difficulty = "easy" | "medium" | "hard";
export type Kho = "personal" | "campus";
export type QuestionStatus = "draft" | "pending" | "approved" | "rejected";

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  content: string;
  explanation?: string;
  subjectId: string;
  gradeId: string | null;
  tocNodeId?: string | null;
  difficulty: Difficulty;
  tags: string[];

  ownerId: string;
  ownerName: string;
  kho: Kho;
  campusId: string | null;

  status: QuestionStatus;
  approvedBy?: string | null;
  rejectionNote?: string | null;

  /** Soft-delete bookkeeping (see lib/lifecycle.ts). */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface McqOption {
  id: string;
  content: string;
  isCorrect: boolean;
}

export interface McqSingleQuestion extends BaseQuestion {
  type: "mcq-single";
  options: McqOption[];
}

export interface McqMultiQuestion extends BaseQuestion {
  type: "mcq-multi";
  options: McqOption[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: "true-false";
  correctAnswer: boolean;
}

export interface MultiTfSub {
  id: string;
  statement: string;
  correctAnswer: boolean;
}
export interface MultiTfQuestion extends BaseQuestion {
  type: "multi-tf";
  subQuestions: MultiTfSub[];
}

export interface ShortAnswerQuestion extends BaseQuestion {
  type: "short-answer";
  acceptedAnswers: string[];
  caseSensitive: boolean;
}

export interface FillBlankQuestion extends BaseQuestion {
  type: "fill-blank";
  blanks: Array<{ acceptedAnswers: string[] }>;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}
/** Distractor item shown alongside the real `right` options to make the
 *  matching question harder. Has no corresponding `left`, so picking it
 *  for any pair counts as wrong. */
export interface MatchingDistractor {
  id: string;
  right: string;
}
export interface MatchingQuestion extends BaseQuestion {
  type: "matching";
  pairs: MatchingPair[];
  /** Extra right-side options without a matching left. Optional for
   *  back-compat: existing questions without distractors render as
   *  before. */
  distractors?: MatchingDistractor[];
}

export interface OrderingItem {
  id: string;
  content: string;
}
export interface OrderingQuestion extends BaseQuestion {
  type: "ordering";
  /** Stored in the correct order — student input is compared against this. */
  items: OrderingItem[];
}

export interface DragDropZone {
  id: string;
  /** Correct text the student must drop here. */
  correctContent: string;
}
export interface DragDropDistractor {
  id: string;
  content: string;
}
export interface DragDropQuestion extends BaseQuestion {
  type: "drag-drop";
  /**
   * One per `[zone:N]` chip inserted into `content`. The N is implicit by
   * position in this array (zones[0] is `[zone:1]`).
   */
  zones: DragDropZone[];
  /** Extra wrong-answer chips shown in the pool alongside correct answers. */
  distractors: DragDropDistractor[];
}

export interface EssayQuestion extends BaseQuestion {
  type: "essay";
  /** Min word count required (0 = no minimum). */
  wordMin?: number;
  /** Max word count allowed (0 = no maximum). */
  wordMax?: number;
  /** Grading rubric — each criterion has a label and a point value. */
  rubric: EssayCriterion[];
  /** When true, AI does an initial pass on student answers; teacher confirms. */
  aiAssist?: boolean;
}

export interface EssayCriterion {
  id: string;
  label: string;
  points: number;
}

export interface AiGeneratedQuestion extends BaseQuestion {
  type: "ai-generated";
  prompt: string;
}

/**
 * Underline (gạch chân) — student picks tokens in a passage to underline.
 * The correct answers are stored inline in `content` via `[u:phrase]`
 * markers, so this type has no extra fields.
 */
export interface UnderlineQuestion extends BaseQuestion {
  type: "underline";
}

export type Question =
  | McqSingleQuestion
  | McqMultiQuestion
  | TrueFalseQuestion
  | MultiTfQuestion
  | ShortAnswerQuestion
  | FillBlankQuestion
  | MatchingQuestion
  | OrderingQuestion
  | DragDropQuestion
  | UnderlineQuestion
  | EssayQuestion
  | AiGeneratedQuestion;

const NOW = "2026-05-14T03:00:00.000Z";

export const SEED_QUESTIONS: Question[] = [
  {
    id: "Q-0001",
    type: "mcq-single",
    content: "Đạo hàm của hàm số $f(x) = x^2$ là gì?",
    explanation: "Áp dụng quy tắc cơ bản: $\\frac{d}{dx}x^n = n \\cdot x^{n-1}$.",
    subjectId: "subject-toan",
    gradeId: "grade-10",
    tocNodeId: null,
    difficulty: "easy",
    tags: ["đạo hàm"],
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "approved",
    approvedBy: "U-201",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: NOW,
    options: [
      { id: "a", content: "$x$", isCorrect: false },
      { id: "b", content: "$2x$", isCorrect: true },
      { id: "c", content: "$x^2/2$", isCorrect: false },
      { id: "d", content: "$2$", isCorrect: false },
    ],
  },
  {
    id: "Q-0002",
    type: "mcq-multi",
    content: "Đâu là **các** số nguyên tố?",
    subjectId: "subject-toan",
    gradeId: "grade-7",
    tocNodeId: null,
    difficulty: "easy",
    tags: ["số học"],
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "approved",
    approvedBy: "U-201",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: NOW,
    options: [
      { id: "a", content: "2", isCorrect: true },
      { id: "b", content: "9", isCorrect: false },
      { id: "c", content: "13", isCorrect: true },
      { id: "d", content: "21", isCorrect: false },
    ],
  },
  {
    id: "Q-0003",
    type: "true-false",
    content: "Nước sôi ở $100°C$ trong điều kiện tiêu chuẩn.",
    subjectId: "subject-ly",
    gradeId: "grade-10",
    tocNodeId: null,
    difficulty: "easy",
    tags: ["nhiệt động"],
    ownerId: "U-201",
    ownerName: "Trần Văn Bình",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "approved",
    approvedBy: "U-201",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: NOW,
    correctAnswer: true,
  },
  {
    id: "Q-0004",
    type: "short-answer",
    content: "Thủ đô của Việt Nam là gì?",
    subjectId: "subject-dia",
    gradeId: "grade-9",
    tocNodeId: null,
    difficulty: "easy",
    tags: ["địa lý VN"],
    ownerId: "U-302",
    ownerName: "Lê Hồng An",
    kho: "personal",
    campusId: null,
    status: "approved",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: NOW,
    acceptedAnswers: ["Hà Nội", "Hanoi"],
    caseSensitive: false,
  },
  {
    id: "Q-0005",
    type: "fill-blank",
    content: "Công thức diện tích hình tròn là $S = \\pi r^{___}$.",
    subjectId: "subject-toan",
    gradeId: "grade-9",
    tocNodeId: null,
    difficulty: "medium",
    tags: ["hình học"],
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "pending",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: NOW,
    blanks: [{ acceptedAnswers: ["2"] }],
  },
  {
    id: "Q-0006",
    type: "matching",
    content: "Ghép cặp thủ đô với quốc gia tương ứng.",
    subjectId: "subject-dia",
    gradeId: "grade-9",
    tocNodeId: null,
    difficulty: "medium",
    tags: ["địa lý thế giới"],
    ownerId: "U-302",
    ownerName: "Lê Hồng An",
    kho: "personal",
    campusId: null,
    status: "approved",
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: NOW,
    pairs: [
      { id: "p1", left: "Việt Nam", right: "Hà Nội" },
      { id: "p2", left: "Pháp", right: "Paris" },
      { id: "p3", left: "Nhật Bản", right: "Tokyo" },
    ],
  },
  {
    id: "Q-0007",
    type: "ordering",
    content: "Sắp xếp các bước của vòng đời nước.",
    subjectId: "subject-sinh",
    gradeId: "grade-8",
    tocNodeId: null,
    difficulty: "medium",
    tags: ["sinh thái"],
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "pending",
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: NOW,
    items: [
      { id: "i1", content: "Bốc hơi" },
      { id: "i2", content: "Ngưng tụ" },
      { id: "i3", content: "Mưa" },
      { id: "i4", content: "Thấm xuống đất" },
    ],
  },
  {
    id: "Q-0008",
    type: "multi-tf",
    content:
      "Đọc đoạn văn về quang hợp dưới đây và xác định đúng/sai cho từng nhận định.",
    subjectId: "subject-sinh",
    gradeId: "grade-9",
    tocNodeId: null,
    difficulty: "hard",
    tags: ["quang hợp"],
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "draft",
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: NOW,
    subQuestions: [
      { id: "s1", statement: "Cây quang hợp chỉ vào ban ngày.", correctAnswer: true },
      { id: "s2", statement: "Quang hợp giải phóng khí $CO_2$.", correctAnswer: false },
      { id: "s3", statement: "Diệp lục hấp thụ ánh sáng đỏ và xanh.", correctAnswer: true },
    ],
  },
  {
    id: "Q-0009",
    type: "essay",
    content: "Phân tích bài thơ *Tây Tiến* của Quang Dũng.",
    subjectId: "subject-van",
    gradeId: "grade-12",
    tocNodeId: null,
    difficulty: "hard",
    tags: ["văn học hiện đại"],
    ownerId: "U-302",
    ownerName: "Lê Hồng An",
    kho: "campus",
    campusId: "campus-cau-giay",
    status: "pending",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: NOW,
    wordMin: 300,
    wordMax: 800,
    aiAssist: true,
    rubric: [
      { id: "r1", label: "Mở bài giới thiệu tác giả + bối cảnh", points: 2 },
      { id: "r2", label: "Phân tích hình tượng người lính", points: 4 },
      { id: "r3", label: "Nghệ thuật ngôn từ", points: 2 },
      { id: "r4", label: "Liên hệ thực tiễn", points: 2 },
    ],
  },
  {
    id: "Q-0010",
    type: "drag-drop",
    content: "Phương trình hoá học: [zone:1] + [zone:2] → NaCl + H₂O",
    subjectId: "subject-hoa",
    gradeId: "grade-10",
    tocNodeId: null,
    difficulty: "medium",
    tags: ["axit-bazơ"],
    ownerId: "U-304",
    ownerName: "Trần Tuấn Khang",
    kho: "campus",
    campusId: "campus-da-nang",
    status: "rejected",
    rejectionNote: "Cần thêm distractors để tăng độ khó.",
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: NOW,
    zones: [
      { id: "z1", correctContent: "HCl" },
      { id: "z2", correctContent: "NaOH" },
    ],
    distractors: [
      { id: "d1", content: "H₂SO₄" },
      { id: "d2", content: "KOH" },
    ],
  },
];
