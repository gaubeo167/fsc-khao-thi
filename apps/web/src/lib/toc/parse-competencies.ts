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

function annotate(
  nodes: FrameworkNode[],
  depth: number,
): CompetencyImportNode[] {
  const kind: CompetencyKind =
    depth === 0 ? "chapter" : depth === 1 ? "topic" : "outcome";
  return nodes.map((n) => ({
    code: n.code,
    title: n.name,
    kind,
    bloomLevel: kind === "outcome" ? inferBloomLevel(n.name) : undefined,
    children:
      n.children && n.children.length > 0
        ? annotate(n.children, depth + 1)
        : undefined,
  }));
}

export function parseFrameworkToCompetencies(raw: string): {
  tree: CompetencyImportNode[];
  counts: { chapters: number; topics: number; indicators: number };
} {
  const { tree, counts } = parseFrameworkText(raw);
  return { tree: annotate(tree, 0), counts };
}
