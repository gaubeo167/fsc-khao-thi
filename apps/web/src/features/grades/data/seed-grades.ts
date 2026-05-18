export interface Grade {
  id: string;
  code: string;
  name: string;
  order: number;
  /** Loose denormalized count used until classes-store can drive it. */
  classCount: number;
  studentCount: number;
  status: "active" | "archived";
  createdAt: string;
}

export interface SchoolClass {
  id: string;
  gradeId: string;
  code: string;
  name: string;
  /** Display name fallback. The authoritative link is `homeroomTeacherId`. */
  homeroomTeacher: string;
  /**
   * Refers to a SeedUser id (role = teacher / subject-lead) in the same
   * campus. `null` = no homeroom assigned yet.
   */
  homeroomTeacherId?: string | null;
  studentCount: number;
  campusId: string;
  status: "active" | "archived";
  createdAt: string;
}

// `classCount` / `studentCount` are denormalized helper fields that the
// admin pages now derive from `useGradesStore.classes` at render time. Seed
// them at 0 so the system never displays a fake aggregate — real counts are
// computed against actual class records.
//
// Full grade ladder (1–12) so a campus's tier-driven grade selection can
// cover Tiểu học (1–5), THCS (6–9), THPT (10–12) and any combination.
export const SEED_GRADES: Grade[] = Array.from({ length: 12 }, (_, i) => {
  const num = i + 1; // Khối 1 → 12
  return {
    id: `grade-${num}`,
    code: `K${num}`,
    name: `Khối ${num}`,
    order: i,
    classCount: 0,
    studentCount: 0,
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  };
});

const CAMPUS_DEFAULT = "campus-cau-giay";

export const SEED_CLASSES: SchoolClass[] = [
  // Khối 6
  { id: "class-6-a1", gradeId: "grade-6", code: "6A1", name: "Lớp 6A1", homeroomTeacher: "Phạm Minh", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-01T00:00:00.000Z" },
  { id: "class-6-a2", gradeId: "grade-6", code: "6A2", name: "Lớp 6A2", homeroomTeacher: "Lê Hồng An", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-01T00:00:00.000Z" },
  { id: "class-6-b1", gradeId: "grade-6", code: "6B1", name: "Lớp 6B1", homeroomTeacher: "Vũ Hà My", studentCount: 0, campusId: "campus-hoa-lac", status: "active", createdAt: "2026-02-01T00:00:00.000Z" },
  // Khối 7
  { id: "class-7-a1", gradeId: "grade-7", code: "7A1", name: "Lớp 7A1", homeroomTeacher: "Trần Văn Bình", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-02T00:00:00.000Z" },
  { id: "class-7-a2", gradeId: "grade-7", code: "7A2", name: "Lớp 7A2", homeroomTeacher: "Phạm Minh", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-02T00:00:00.000Z" },
  { id: "class-7-b2", gradeId: "grade-7", code: "7B2", name: "Lớp 7B2", homeroomTeacher: "Đỗ Quang Hưng", studentCount: 0, campusId: "campus-hoa-lac", status: "active", createdAt: "2026-02-02T00:00:00.000Z" },
  // Khối 8
  { id: "class-8-a1", gradeId: "grade-8", code: "8A1", name: "Lớp 8A1", homeroomTeacher: "Nguyễn Thu Hà", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-03T00:00:00.000Z" },
  { id: "class-8-b2", gradeId: "grade-8", code: "8B2", name: "Lớp 8B2", homeroomTeacher: "Lê Tuấn Anh", studentCount: 0, campusId: "campus-hoa-lac", status: "active", createdAt: "2026-02-03T00:00:00.000Z" },
  // Khối 9
  { id: "class-9-a1", gradeId: "grade-9", code: "9A1", name: "Lớp 9A1", homeroomTeacher: "Trần Tuấn Khang", studentCount: 0, campusId: "campus-da-nang", status: "active", createdAt: "2026-02-04T00:00:00.000Z" },
  { id: "class-9-c1", gradeId: "grade-9", code: "9C1", name: "Lớp 9C1", homeroomTeacher: "Trần Thị Hà", studentCount: 0, campusId: "campus-da-nang", status: "active", createdAt: "2026-02-04T00:00:00.000Z" },
  // Khối 10
  { id: "class-10-a1", gradeId: "grade-10", code: "10A1", name: "Lớp 10A1", homeroomTeacher: "Phạm Minh", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-05T00:00:00.000Z" },
  { id: "class-10-a2", gradeId: "grade-10", code: "10A2", name: "Lớp 10A2", homeroomTeacher: "Trần Văn Bình", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-05T00:00:00.000Z" },
  // Khối 11
  { id: "class-11-a1", gradeId: "grade-11", code: "11A1", name: "Lớp 11A1", homeroomTeacher: "Nguyễn Mỹ Linh", studentCount: 0, campusId: "campus-hoa-lac", status: "active", createdAt: "2026-02-06T00:00:00.000Z" },
  // Khối 12
  { id: "class-12-a1", gradeId: "grade-12", code: "12A1", name: "Lớp 12A1", homeroomTeacher: "Nguyễn Thu Hà", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-07T00:00:00.000Z" },
  { id: "class-12-c1", gradeId: "grade-12", code: "12C1", name: "Lớp 12C1", homeroomTeacher: "Lê Hồng An", studentCount: 0, campusId: CAMPUS_DEFAULT, status: "active", createdAt: "2026-02-07T00:00:00.000Z" },
];
