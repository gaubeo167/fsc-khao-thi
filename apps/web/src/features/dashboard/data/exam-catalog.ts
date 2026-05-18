import { MATH_FINAL } from "@/mocks/math-final";

export interface CatalogExam {
  examId: string;
  title: string;
  subject: string;
  durationMs: number;
  questionCount: number;
  format: "MCQ" | "Mixed" | "Essay";
  description: string;
  available: boolean;
}

/**
 * Static catalog used while the backend doesn't have an Exam/Question model.
 * The runtime currently only knows how to render MATH_FINAL; other entries
 * are visible as "Sắp mở" placeholders to demonstrate the dashboard layout.
 */
export const EXAM_CATALOG: CatalogExam[] = [
  {
    examId: MATH_FINAL.examId,
    title: MATH_FINAL.title,
    subject: "Toán",
    durationMs: 60 * 60 * 1000,
    questionCount: MATH_FINAL.questions.length,
    format: "MCQ",
    description: "Đại số · Giải tích cơ bản · Hình học.",
    available: true,
  },
  {
    examId: "physics-kt1",
    title: "Vật lý KT1",
    subject: "Vật lý",
    durationMs: 90 * 60 * 1000,
    questionCount: 20,
    format: "MCQ",
    description: "Cơ học · Nhiệt học · Điện học.",
    available: false,
  },
  {
    examId: "english-final",
    title: "Anh văn cuối kỳ",
    subject: "Tiếng Anh",
    durationMs: 75 * 60 * 1000,
    questionCount: 40,
    format: "MCQ",
    description: "Reading · Listening · Vocabulary.",
    available: false,
  },
];

export function getCatalogExam(examId: string): CatalogExam | undefined {
  return EXAM_CATALOG.find((e) => e.examId === examId);
}
