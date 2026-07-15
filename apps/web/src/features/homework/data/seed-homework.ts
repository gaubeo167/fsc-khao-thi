import type { Homework } from "./types";

/**
 * Demo-mode seed BTVN. Empty in production (store inits to []). Targets
 * học sinh U-401 directly via `studentIds` (seed classes carry no
 * studentIds, so class-based targeting wouldn't resolve in demo). Questions
 * are approved seed questions; attachment is MAT-0001 (seed-materials).
 */
export const SEED_HOMEWORK: Homework[] = [
  {
    id: "HW-0001",
    title: "Ôn tập Đại số — Số nguyên tố & đạo hàm",
    description:
      "Hoàn thành các câu hỏi ôn tập trước buổi học tới. Xem học liệu đính kèm nếu cần.",
    subjectId: "subject-toan",
    gradeId: "grade-7",
    classIds: ["class-7-a1"],
    studentIds: ["U-401"],
    questionIds: ["Q-0002", "Q-0001", "Q-0003", "Q-0004"],
    materialIds: ["MAT-0001"],
    assignedAt: "2026-06-16",
    dueAt: "2099-12-31",
    campusId: "campus-cau-giay",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    status: "published",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  },
];
