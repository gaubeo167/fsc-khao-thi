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
        pickedQuestionIds: ["Q-0001"],
      },
    ],
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: NOW,
  },
];

// Demo-mode sample package (approved) built on BP-0001 so the "Quản lý đề thi",
// the shift wizard (step 2) and the student exam flow have data without
// Firebase. Production (Firebase configured) ignores these — the store inits
// to [] there.
export const SEED_PACKAGES: ExamPackage[] = [
  {
    id: "PKG-0001",
    name: "Gói đề Toán 7 — Giữa kỳ I",
    blueprintId: "BP-0001",
    duration: 45,
    campusId: "campus-cau-giay",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    matrix: [
      { topicId: "tp-0001", easyCount: 1, mediumCount: 0, hardCount: 0 },
      { topicId: "tp-0002", easyCount: 1, mediumCount: 0, hardCount: 0 },
    ],
    status: "approved",
    approvedBy: "U-201",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: NOW,
  },
];

// Two generated variants for PKG-0001 so it reads "đã sinh đề" (required
// before a shift can be created from it).
export const SEED_GENERATED: GeneratedExam[] = [
  {
    id: "GEN-0001",
    name: "Đề 001",
    packageId: "PKG-0001",
    questionIds: ["Q-0002", "Q-0001"],
    duration: 45,
    createdAt: "2026-05-12T01:00:00.000Z",
  },
  {
    id: "GEN-0002",
    name: "Đề 002",
    packageId: "PKG-0001",
    questionIds: ["Q-0001", "Q-0002"],
    duration: 45,
    createdAt: "2026-05-12T01:00:00.000Z",
  },
];
