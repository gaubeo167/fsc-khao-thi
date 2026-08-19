/**
 * Khung năng lực / Yêu cầu cần đạt (YCCĐ)
 * ────────────────────────────────────────
 * A SEPARATE dimension from the mục lục (TOC / `toc_nodes`). The TOC stays
 * the storage-and-drawing structure (Chương → Chủ đề → Chủ điểm → Kỹ năng);
 * this competency tree encodes WHICH standardised learning outcome (YCCĐ,
 * theo chuẩn Bộ GD) a whole question — or each option / mỗi ý of a
 * multi-answer question — assesses, plus its Bloom cognitive level.
 *
 * Three levels, mirroring the "khung kiến thức" Word template:
 *   Chương (chapter)  → Chủ đề (topic)  → YCCĐ (outcome, the leaf)
 * Only the leaf `outcome` carries a `bloomLevel`.
 */

/** Mức độ nhận thức (Bloom) — SEPARATE from `difficulty` (easy/medium/hard).
 *  1 = Nhận biết (Biết), 2 = Thông hiểu (Hiểu), 3 = Vận dụng. */
export type BloomLevel = 1 | 2 | 3;

export const BLOOM_LEVELS = [
  {
    level: 1,
    full: "Nhận biết",
    short: "NB",
    chipBg: "bg-emerald-50",
    chipFg: "text-emerald-700",
    border: "border-emerald-200",
  },
  {
    level: 2,
    full: "Thông hiểu",
    short: "TH",
    chipBg: "bg-amber-50",
    chipFg: "text-amber-700",
    border: "border-amber-200",
  },
  {
    level: 3,
    full: "Vận dụng",
    short: "VD",
    chipBg: "bg-rose-50",
    chipFg: "text-rose-700",
    border: "border-rose-200",
  },
] as const;

export function bloomMeta(level: BloomLevel | null | undefined) {
  return BLOOM_LEVELS.find((b) => b.level === level) ?? null;
}

export type CompetencyKind = "chapter" | "topic" | "outcome";

/** Depth 0/1/2 label + styling, parallel to TOC_LEVELS. */
export const COMPETENCY_LEVELS = [
  {
    kind: "chapter" as const,
    full: "Chương",
    short: "Ch",
    barClass: "bg-blue-500",
    chipBg: "bg-blue-50",
    chipFg: "text-blue-700",
  },
  {
    kind: "topic" as const,
    full: "Chủ đề",
    short: "CĐ",
    barClass: "bg-purple-500",
    chipBg: "bg-purple-50",
    chipFg: "text-purple-700",
  },
  {
    kind: "outcome" as const,
    full: "YCCĐ",
    short: "YC",
    barClass: "bg-teal-500",
    chipBg: "bg-teal-50",
    chipFg: "text-teal-700",
  },
] as const;

export function competencyKindMeta(kind: CompetencyKind) {
  return COMPETENCY_LEVELS.find((l) => l.kind === kind) ?? COMPETENCY_LEVELS[0];
}

export interface Competency {
  id: string;
  subjectId: string;
  /**
   * Cơ sở sở hữu node này. Mỗi campus là một tập dữ liệu độc lập.
   *
   * `null` = CHƯA GÁN — dữ liệu có từ trước khi trường này tồn tại. Node chưa
   * gán vẫn hiện ở mọi cơ sở (giữ nguyên hành vi cũ) để việc lên bản mới không
   * làm biến mất mục lục/khung đang dùng. Chạy `scripts/migrate-campus-scope.mjs`
   * để gán chủ cho chúng; gán xong thì việc cách ly mới trọn vẹn.
   */
  campusId?: string | null;

  /** Optional grade scope. null = whole subject across grades (mirrors TocNode). */
  gradeId: string | null;
  parentId: string | null;
  kind: CompetencyKind;
  /** Human-readable outcome text ("Nêu được đối tượng…") or chapter/topic name. */
  title: string;
  /**
   * Standardised code from the imported khung (e.g. "SI10.01" chương,
   * "SI10.01.1" chủ đề, "SI10.01.1.D01" YCCĐ). Used to dedupe on re-import
   * and as the stable reference a question/ý links to.
   */
  code?: string | null;
  /** Bloom cognitive level — only meaningful for kind === "outcome". */
  bloomLevel?: BloomLevel | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}
