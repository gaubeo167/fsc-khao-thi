import type { StudentAttempt } from "../state/attempts-store";

/**
 * Demo-mode seed exam attempts. Empty in production (store inits to []).
 * One submitted attempt by Nguyễn Hoàng Lan (U-401) for shift SH-0002 so
 * the "Lịch sử bài thi" + "Kết quả" screens have data. Answers are correct
 * (Q-0001 → b, Q-0002 → a,c) so the result shows full marks.
 */
export const SEED_EXAM_ATTEMPTS: StudentAttempt[] = [
  {
    id: "att-SH-0002-U-401",
    shiftId: "SH-0002",
    studentId: "U-401",
    campusId: "campus-cau-giay",
    questionIds: ["Q-0002", "Q-0001"],
    examFormId: null,
    variantId: null,
    answers: {
      "Q-0002": { kind: "mcq-multi", optionIds: ["a", "c"] },
      "Q-0001": { kind: "mcq-single", optionId: "b" },
    },
    markedForReview: [],
    startedAt: "2026-06-10T01:05:00.000Z",
    submittedAt: "2026-06-10T01:18:00.000Z",
    // Matches attempts-store.submit(): score = percent (0–100), maxScore =
    // question count. Here 2/2 correct → 100%.
    score: 100,
    maxScore: 2,
    correctCount: 2,
    violations: { tabSwitches: 0, fullscreenExits: 0, pasteAttempts: 0 },
  },
];
