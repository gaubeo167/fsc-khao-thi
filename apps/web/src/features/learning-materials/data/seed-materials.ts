import type { LearningMaterial } from "./types";

/**
 * Demo-mode seed học liệu. Empty in production (store inits to []). Scoped
 * to môn Toán · khối 7 · lớp 7A1 · campus Cầu Giấy, approved, so học sinh
 * U-401 thấy ở "Học liệu" và BTVN HW-0001 đính kèm MAT-0001.
 */
export const SEED_MATERIALS: LearningMaterial[] = [
  {
    id: "MAT-0001",
    title: "Video: Số nguyên tố là gì?",
    description: "Bài giảng ngắn ôn lại khái niệm số nguyên tố và cách kiểm tra.",
    sourceType: "link",
    fileType: "video",
    storagePath: "",
    downloadUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    originalFilename: "",
    contentType: "text/html",
    sizeBytes: 0,
    subjectId: "subject-toan",
    gradeId: "grade-7",
    classIds: ["class-7-a1"],
    tags: ["số học", "ôn tập"],
    kho: "campus",
    status: "approved",
    approvedBy: "U-201",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    campusId: "campus-cau-giay",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    id: "MAT-0002",
    title: "Tài liệu: Bài tập Đại số 7 (PDF)",
    description: "Tổng hợp bài tập tự luyện chương Đại số lớp 7.",
    sourceType: "link",
    fileType: "pdf",
    storagePath: "",
    downloadUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    externalUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    originalFilename: "bai-tap-dai-so-7.pdf",
    contentType: "application/pdf",
    sizeBytes: 245000,
    subjectId: "subject-toan",
    gradeId: "grade-7",
    classIds: ["class-7-a1"],
    tags: ["đại số", "bài tập"],
    kho: "campus",
    status: "approved",
    approvedBy: "U-201",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    campusId: "campus-cau-giay",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  },
];
