/**
 * Group a mạch's picked questions by CP (chủ điểm = leaf mục lục node).
 * Shared by the blueprint editor (display) and the package editor (per-CP
 * draw matrix).
 */
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { TocNode } from "@/features/subjects/data/seed-toc";

export interface LeafInfo {
  byId: Map<string, TocNode>;
  /** A CP is a leaf node — no other scoped node lists it as parent. */
  isLeaf: (id: string | null | undefined) => boolean;
}

export function buildLeafInfo(
  tocNodes: TocNode[],
  subjectId: string,
  gradeId: string,
): LeafInfo {
  const scoped = tocNodes.filter(
    (n) => n.subjectId === subjectId && n.gradeId === gradeId,
  );
  const parentIds = new Set(
    scoped.map((n) => n.parentId).filter((p): p is string => !!p),
  );
  const byId = new Map(scoped.map((n) => [n.id, n]));
  return {
    byId,
    isLeaf: (id) => !!id && byId.has(id) && !parentIds.has(id),
  };
}

export interface CpAvail {
  nodeId: string;
  name: string;
  code?: string;
  available: number;
}

/**
 * For a set of picked question ids, return the CP groups (leaf tocNode with
 * how many picked questions it holds) and the count of "ngoài CP" questions
 * (attached to a CĐ/Chương or nothing).
 */
export function topicCpAvailability(
  pickedIds: string[],
  poolById: Map<string, Question>,
  leaf: LeafInfo,
): { cps: CpAvail[]; outsideAvailable: number } {
  const groups = new Map<string, CpAvail>();
  let outside = 0;
  for (const qid of pickedIds) {
    const q = poolById.get(qid);
    if (!q) continue;
    const nodeId = q.tocNodeId ?? null;
    if (nodeId && leaf.isLeaf(nodeId)) {
      const node = leaf.byId.get(nodeId)!;
      const g =
        groups.get(nodeId) ??
        { nodeId, name: node.name, code: node.code, available: 0 };
      g.available += 1;
      groups.set(nodeId, g);
    } else {
      outside += 1;
    }
  }
  const cps = [...groups.values()].sort((a, b) =>
    (a.code ?? "").localeCompare(b.code ?? ""),
  );
  return { cps, outsideAvailable: outside };
}
