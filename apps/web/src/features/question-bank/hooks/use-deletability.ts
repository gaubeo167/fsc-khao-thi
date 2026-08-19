"use client";

import { useCallback, useMemo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useExamFormsStore } from "@/features/exam-forms/state/exam-forms-store";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { useGeneratedStore } from "@/features/exams/state/generated-store";
import { useHomeworkAttemptsStore } from "@/features/homework/state/homework-attempts-store";
import { useHomeworkStore } from "@/features/homework/state/homework-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";

import {
  allHydrated,
  canHardDelete,
  splitDeletable,
  type DeleteVerdict,
  type DeletionHydration,
  type DeletionSources,
} from "../lib/question-delete";
import { useQuestionsStore } from "../state/questions-store";

/**
 * Gom sáu nguồn tham chiếu + cờ tải xong của chúng, để hỏi "câu này xoá cứng
 * được không".
 *
 * Luật nằm ở `lib/question-delete.ts`; hook này chỉ đi lấy dữ liệu. Tách ra
 * để chỗ nào cần soát cũng dùng CHUNG một phép soát — thao tác lẻ và thao tác
 * hàng loạt mà soát bằng hai đoạn code khác nhau thì sớm muộn cũng lệch, và
 * lệch ở đây nghĩa là xoá mất dữ liệu thi thật.
 *
 * Đọc cả mảng dữ liệu lẫn cờ `hydrated` từ MỖI store: mảng rỗng vì chưa tải
 * xong và mảng rỗng vì không có tham chiếu trông giống hệt nhau.
 */
export function useDeletability() {
  const questions = useQuestionsStore((s) => s.questions);
  /** Chỉ người TẠO câu mới xoá vĩnh viễn được — xem `question-delete.ts`. */
  const actorUserId = useAuthStore((s) => s.session?.userId ?? null);
  const questionsHydrated = useQuestionsStore((s) => s.hydrated);
  const examForms = useExamFormsStore((s) => s.forms);
  const examFormsHydrated = useExamFormsStore((s) => s.hydrated);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const blueprintsHydrated = useBlueprintsStore((s) => s.hydrated);
  const generated = useGeneratedStore((s) => s.generated);
  const generatedHydrated = useGeneratedStore((s) => s.hydrated);
  const homework = useHomeworkStore((s) => s.homework);
  const homeworkHydrated = useHomeworkStore((s) => s.hydrated);
  const attempts = useAttemptsStore((s) => s.attempts);
  const attemptsHydrated = useAttemptsStore((s) => s.hydrated);
  const hwAttempts = useHomeworkAttemptsStore((s) => s.attempts);
  const hwAttemptsHydrated = useHomeworkAttemptsStore((s) => s.hydrated);

  const sources = useMemo<DeletionSources>(
    () => ({
      examForms,
      blueprints,
      generated,
      homework,
      attempts,
      homeworkAttempts: hwAttempts,
      questions,
    }),
    [examForms, blueprints, generated, homework, attempts, hwAttempts, questions],
  );

  const hydration = useMemo<DeletionHydration>(
    () => ({
      examForms: examFormsHydrated,
      blueprints: blueprintsHydrated,
      generated: generatedHydrated,
      homework: homeworkHydrated,
      attempts: attemptsHydrated,
      homeworkAttempts: hwAttemptsHydrated,
      questions: questionsHydrated,
    }),
    [
      examFormsHydrated,
      blueprintsHydrated,
      generatedHydrated,
      homeworkHydrated,
      attemptsHydrated,
      hwAttemptsHydrated,
      questionsHydrated,
    ],
  );

  const ready = allHydrated(hydration);

  const verdictFor = useCallback(
    (questionId: string): DeleteVerdict =>
      canHardDelete(questionId, sources, hydration, actorUserId),
    [sources, hydration, actorUserId],
  );

  const split = useCallback(
    <T extends { id: string }>(rows: readonly T[]) =>
      splitDeletable(rows, sources, hydration, actorUserId),
    [sources, hydration, actorUserId],
  );

  return { ready, verdictFor, split };
}
