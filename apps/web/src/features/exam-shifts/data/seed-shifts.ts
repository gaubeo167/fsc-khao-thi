import type { AntiCheatConfig, ExamShift } from "./types";

/**
 * Demo-mode seed shifts. Only used when Firebase isn't configured (the
 * shifts-store inits to [] in production). Built around the demo anchors:
 * campus Cầu Giấy, lớp 7A1 (class-7-a1), học sinh Nguyễn Hoàng Lan
 * (U-401), giáo viên Phạm Minh (U-301), gói đề PKG-0001.
 *
 * - SH-0001: đang mở (giờ hiện tại nằm trong khoảng) → dùng cho "Lịch thi
 *   của tôi" + màn làm bài. Không có exam-form snapshot nên runtime dùng
 *   fallback theo khung đề BP-0001 (2 câu Q-0002 + Q-0001).
 * - SH-0002: đã kết thúc → ghép với bài làm đã nộp (seed-attempts) cho màn
 *   Lịch sử + Kết quả.
 */

const NO_CHEAT: AntiCheatConfig = {
  randomizeQuestions: true,
  randomizeOptions: true,
  requireFullscreen: false,
  blockTabSwitch: false,
  blockCopyPaste: false,
  blockRightClick: false,
  requireWebcam: false,
  faceDetection: false,
  oneTimeStart: true,
};

export const SEED_SHIFTS: ExamShift[] = [
  {
    id: "SH-0001",
    name: "Kiểm tra giữa kỳ I — Toán 7A1",
    gradeId: "grade-7",
    subjectId: "subject-toan",
    classIds: ["class-7-a1"],
    packageId: "PKG-0001",
    startAt: "2026-06-18T01:00:00.000Z",
    endAt: "2026-06-30T10:00:00.000Z",
    lateJoinMinutes: 9999,
    rooms: [
      {
        id: "room-1",
        name: "Phòng A1",
        capacity: 30,
        classIds: ["class-7-a1"],
        studentIds: ["U-401"],
        proctorIds: ["U-301"],
      },
    ],
    scoring: {
      maxScore: 10,
      mode: "even",
      difficultyWeights: { easy: 1, medium: 1.5, hard: 2 },
    },
    studentResultVisibility: "full",
    antiCheat: NO_CHEAT,
    campusId: "campus-cau-giay",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    status: "scheduled",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "SH-0002",
    name: "Kiểm tra 15 phút — Toán 7A1",
    gradeId: "grade-7",
    subjectId: "subject-toan",
    classIds: ["class-7-a1"],
    packageId: "PKG-0001",
    startAt: "2026-06-10T01:00:00.000Z",
    endAt: "2026-06-10T02:00:00.000Z",
    lateJoinMinutes: 10,
    rooms: [
      {
        id: "room-1",
        name: "Phòng A1",
        capacity: 30,
        classIds: ["class-7-a1"],
        studentIds: ["U-401"],
        proctorIds: ["U-301"],
      },
    ],
    scoring: {
      maxScore: 10,
      mode: "even",
      difficultyWeights: { easy: 1, medium: 1.5, hard: 2 },
    },
    studentResultVisibility: "full",
    antiCheat: NO_CHEAT,
    campusId: "campus-cau-giay",
    ownerId: "U-301",
    ownerName: "Phạm Minh",
    status: "scheduled",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-10T02:00:00.000Z",
  },
];
