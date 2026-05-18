import type { ExamBlueprint, ExamPackage, GeneratedExam } from "./types";

const NOW = "2026-05-14T03:00:00.000Z";

export const SEED_BLUEPRINTS: ExamBlueprint[] = [
  {
    id: "BP-0001",
    name: "Khung đề Toán 7 — Học kỳ I",
    subjectId: "subject-toan",
    gradeId: "grade-7",
    duration: 60,
    campusId: "campus-cau-giay",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    topics: [
      {
        id: "tp-0001",
        name: "Đại số",
        pickedQuestionIds: ["Q-0002"],
      },
      {
        id: "tp-0002",
        name: "Hình học",
        pickedQuestionIds: [],
      },
    ],
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: NOW,
  },
];

export const SEED_PACKAGES: ExamPackage[] = [];
// Note: SEED_PACKAGES is empty so we don't have to maintain a sample with the
// new approval fields. Future seeds should include `status: "approved"`.
export const SEED_GENERATED: GeneratedExam[] = [];
