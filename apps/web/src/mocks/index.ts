import type { ExamBank } from "@/features/attempts/types";

import { MATH_FINAL } from "./math-final";

const BANKS: Record<string, ExamBank> = {
  [MATH_FINAL.examId]: MATH_FINAL,
};

export function getBankByExamId(examId: string): ExamBank | undefined {
  return BANKS[examId];
}

export const DEFAULT_EXAM_ID = MATH_FINAL.examId;
