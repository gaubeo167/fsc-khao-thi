export interface TocNode {
  id: string;
  subjectId: string;
  /** Optional grade scope. null = applies to the whole subject across grades. */
  gradeId: string | null;
  parentId: string | null;
  name: string;
  order: number;
}

/**
 * Hierarchy convention — 4 levels (depth 0..3):
 *   Depth 0: Chương (Chapter)  — short "Ch"
 *   Depth 1: Chủ đề (Topic)    — short "CĐ"
 *   Depth 2: Chủ điểm (Subtopic) — short "CP"
 *   Depth 3: Kỹ năng (Skill)   — short "KN"
 *
 * Depth is derived from `parentId` chain at render time.
 */
export const TOC_LEVELS = [
  { full: "Chương", short: "Ch", barClass: "bg-blue-500", chipBg: "bg-blue-50", chipFg: "text-blue-700" },
  { full: "Chủ đề", short: "CĐ", barClass: "bg-purple-500", chipBg: "bg-purple-50", chipFg: "text-purple-700" },
  { full: "Chủ điểm", short: "CP", barClass: "bg-emerald-500", chipBg: "bg-emerald-50", chipFg: "text-emerald-700" },
  { full: "Kỹ năng", short: "KN", barClass: "bg-amber-500", chipBg: "bg-amber-50", chipFg: "text-amber-700" },
] as const;

export const TOC_LEVEL_LABEL = TOC_LEVELS.map((l) => l.full) as readonly string[];

const TOAN_K10 = "subject-toan";
const GRADE_10 = "grade-10";

export const SEED_TOC: TocNode[] = [
  { id: "toc-t10-c1", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: null, name: "Mệnh đề - Tập hợp", order: 0 },
  { id: "toc-t10-c1-1", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c1", name: "Mệnh đề", order: 0 },
  { id: "toc-t10-c1-1-a", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c1-1", name: "Khái niệm cơ bản về mệnh đề và phép phủ định", order: 0 },
  { id: "toc-t10-c1-1-b", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c1-1", name: "Mệnh đề kéo theo và mệnh đề tương đương", order: 1 },
  { id: "toc-t10-c1-2", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c1", name: "Tập hợp", order: 1 },
  { id: "toc-t10-c1-2-a", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c1-2", name: "Khái niệm tập hợp và các phép toán", order: 0 },

  { id: "toc-t10-c2", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: null, name: "Bất phương trình - Hệ bất phương trình bậc nhất hai ẩn", order: 1 },
  { id: "toc-t10-c2-1", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c2", name: "Bất phương trình bậc nhất hai ẩn", order: 0 },
  { id: "toc-t10-c2-2", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c2", name: "Hệ bất phương trình bậc nhất hai ẩn", order: 1 },

  { id: "toc-t10-c3", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: null, name: "Hệ thức lượng trong tam giác", order: 2 },
  { id: "toc-t10-c3-1", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: "toc-t10-c3", name: "Định lý côsin và định lý sin", order: 0 },

  { id: "toc-t10-c4", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: null, name: "Vectơ", order: 3 },

  { id: "toc-t10-c5", subjectId: TOAN_K10, gradeId: GRADE_10, parentId: null, name: "Thống kê và xác suất", order: 4 },
];
