/**
 * Adapts the existing "khung kiến thức" Word parser (`parse-framework.ts`)
 * into a **competency (YCCĐ)** import tree. Same 3-level structure —
 * Chương → Chủ đề → Chỉ báo — but each leaf (the Chỉ báo = YCCĐ / outcome)
 * is annotated with an inferred Bloom level from its action verb, and each
 * node is tagged with an explicit `kind` (chapter | topic | outcome).
 *
 * Bloom is only a first guess; the user can override it in the Khung YCCĐ
 * editor. The mục lục (TOC) import path is untouched — this is a parallel
 * consumer of the same parsed tree.
 */
import type { BloomLevel, CompetencyKind } from "@/features/competencies/data/types";

import { parseFrameworkText, type FrameworkNode } from "./parse-framework";

export interface CompetencyImportNode {
  code: string;
  title: string;
  kind: CompetencyKind;
  bloomLevel?: BloomLevel;
  children?: CompetencyImportNode[];
}

// Vietnamese outcome verbs → Bloom level. Position of the EARLIEST-matching
// verb wins, so "Nêu được cách vận dụng…" reads as Nhận biết (nêu), matching
// the leading action verb rather than any later word.
const BLOOM_VERBS: { level: BloomLevel; verbs: string[] }[] = [
  {
    level: 1,
    verbs: [
      "nêu",
      "kể tên",
      "kể",
      "liệt kê",
      "nhận biết",
      "nhận ra",
      "phát biểu",
      "xác định",
      "gọi tên",
      "nhớ",
      "biết",
    ],
  },
  {
    level: 2,
    verbs: [
      "trình bày",
      "giải thích",
      "mô tả",
      "phân biệt",
      "so sánh",
      "tóm tắt",
      "phân loại",
      "minh hoạ",
      "minh họa",
      "lấy ví dụ",
      "chỉ ra",
      "làm rõ",
      "hiểu",
    ],
  },
  {
    level: 3,
    verbs: [
      "vận dụng",
      "phân tích",
      "chứng minh",
      "thiết kế",
      "đánh giá",
      "xây dựng",
      "đề xuất",
      "giải quyết",
      "tính toán",
      "lập luận",
      "tổng hợp",
      "liên hệ",
      "sáng tạo",
    ],
  },
];

export function inferBloomLevel(title: string): BloomLevel {
  const t = (title ?? "").toLowerCase();
  let best: { pos: number; level: BloomLevel } | null = null;
  for (const { level, verbs } of BLOOM_VERBS) {
    for (const v of verbs) {
      const pos = t.indexOf(v);
      if (pos >= 0 && (best === null || pos < best.pos)) {
        best = { pos, level };
      }
    }
  }
  return best?.level ?? 1;
}

// In the FSC khung template the leading letter of each YCCĐ IS its cognitive
// level: a. = Nhận biết (1), b. = Thông hiểu (2), c. = Vận dụng (3). Accept a
// single leading letter followed by "." or ")" + a space. This is the primary,
// deterministic signal; the verb heuristic is only a fallback.
const LETTER_MARKER_RE = /^\s*([a-dA-D])\s*[.)]\s+/;
const LETTER_TO_BLOOM: Record<string, BloomLevel> = { a: 1, b: 2, c: 3, d: 3 };

/** Bloom level from the leading a./b./c. marker, or null if absent. */
export function bloomFromLetter(title: string): BloomLevel | null {
  const m = LETTER_MARKER_RE.exec(title ?? "");
  if (!m) return null;
  return LETTER_TO_BLOOM[m[1]!.toLowerCase()] ?? null;
}

/** Strip the leading a./b./c. marker — it's Bloom metadata, not content. */
export function stripLetterMarker(title: string): string {
  return (title ?? "").replace(LETTER_MARKER_RE, "").trim();
}

/** Bloom for an outcome: letter marker first, else verb heuristic. */
export function outcomeBloomLevel(title: string): BloomLevel {
  return bloomFromLetter(title) ?? inferBloomLevel(title);
}

/** Annotate an already-parsed framework tree (from parse-framework or the
 *  /api/subjects/parse-framework route) with competency `kind` per depth and
 *  an inferred `bloomLevel` on each outcome leaf. */
export function frameworkTreeToCompetencies(
  nodes: FrameworkNode[],
  depth = 0,
): CompetencyImportNode[] {
  const kind: CompetencyKind =
    depth === 0 ? "chapter" : depth === 1 ? "topic" : "outcome";
  return nodes.map((n) => ({
    code: n.code,
    // For a YCCĐ, drop the leading a./b./c. marker — it becomes the Bloom tag.
    title: kind === "outcome" ? stripLetterMarker(n.name) : n.name,
    kind,
    bloomLevel: kind === "outcome" ? outcomeBloomLevel(n.name) : undefined,
    children:
      n.children && n.children.length > 0
        ? frameworkTreeToCompetencies(n.children, depth + 1)
        : undefined,
  }));
}

export function parseFrameworkToCompetencies(raw: string): {
  tree: CompetencyImportNode[];
  counts: { chapters: number; topics: number; indicators: number };
  /** Dòng có mã nhưng đọc không ra — người nhập khung phải thấy. */
  skipped: string[];
} {
  const { tree, counts, skipped } = parseFrameworkText(raw);
  return { tree: frameworkTreeToCompetencies(tree, 0), counts, skipped };
}
