export interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Hex color for the subject's identity. Used to tint icons + chips. */
  color: string;
  /** Grades this subject is taught in. */
  gradeIds: string[];
  /**
   * Campuses that offer this subject. Empty array is treated as "all
   * campuses" (legacy / global). Filtering across the app uses this so the
   * subject set in each campus is what the campus admin actually set up.
   */
  campusIds: string[];
  status: "active" | "archived";
  createdAt: string;
}

/**
 * The 10-color palette used by the subject color picker. Modern,
 * higher-saturation tones — matches the reference dialog.
 */
export const SUBJECT_COLORS = [
  "#2563EB", // blue
  "#DC2626", // red
  "#10B981", // emerald
  "#6366F1", // indigo
  "#D97706", // amber
  "#16A34A", // forest green
  "#EA580C", // orange
  "#0D9488", // teal
  "#E11D48", // rose
  "#475569", // slate
] as const;

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => `grade-${i + 1}`);
const HIGH_SCHOOL = ["grade-10", "grade-11", "grade-12"];
const JUNIOR = ["grade-6", "grade-7", "grade-8", "grade-9"];

const ALL_CAMPUSES = [
  "campus-cau-giay",
  "campus-hoa-lac",
  "campus-da-nang",
  "campus-hcm",
  "campus-can-tho",
];

export const SEED_SUBJECTS: Subject[] = [
  { id: "subject-toan", code: "MATH", name: "Toán", description: "Toán đại số · hình học · giải tích.", color: "#2563EB", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-05T00:00:00.000Z" },
  { id: "subject-van", code: "LIT", name: "Ngữ văn", description: "Văn học và tiếng Việt.", color: "#DC2626", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-05T00:00:00.000Z" },
  { id: "subject-anh", code: "ENG", name: "Tiếng Anh", description: "Tiếng Anh.", color: "#10B981", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-05T00:00:00.000Z" },
  { id: "subject-ly", code: "PHY", name: "Vật lý", description: "Cơ học · điện học · quang học.", color: "#6366F1", gradeIds: HIGH_SCHOOL, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-06T00:00:00.000Z" },
  { id: "subject-hoa", code: "CHEM", name: "Hóa học", description: "Hóa vô cơ · hữu cơ.", color: "#D97706", gradeIds: HIGH_SCHOOL, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-06T00:00:00.000Z" },
  { id: "subject-sinh", code: "BIO", name: "Sinh học", description: "Sinh học cơ bản và nâng cao.", color: "#16A34A", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-06T00:00:00.000Z" },
  { id: "subject-su", code: "HIST", name: "Lịch sử", description: "Lịch sử Việt Nam và thế giới.", color: "#EA580C", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-06T00:00:00.000Z" },
  { id: "subject-dia", code: "GEO", name: "Địa lý", description: "Địa lý tự nhiên và kinh tế.", color: "#0D9488", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-06T00:00:00.000Z" },
  { id: "subject-td", code: "PE", name: "Thể dục", description: "Vận động và thể chất.", color: "#E11D48", gradeIds: ALL_GRADES, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-07T00:00:00.000Z" },
  { id: "subject-nh", code: "MUS", name: "Âm nhạc", description: "Lý thuyết âm nhạc cơ bản.", color: "#475569", gradeIds: JUNIOR, campusIds: ALL_CAMPUSES, status: "active", createdAt: "2026-01-07T00:00:00.000Z" },
];
