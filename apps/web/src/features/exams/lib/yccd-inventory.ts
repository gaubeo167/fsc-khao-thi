/**
 * Tồn kho (inventory) for the MOET matrix — available question count per
 * (Bài × phần × Bloom), content-deduped so the matrix (step ③) can never
 * promise more than the draw can deliver. Keyed by `cellKey` for O(1) lookup.
 */
import type { Question } from "@/features/question-bank/data/seed-questions";

import type { YccdPart } from "../data/types";

import {
  cellKey,
  normContent,
  placementOf,
  type YccdResolvers,
} from "./generate-yccd";

/** cellKey(topicId, partId, bloom) → available count. */
export type YccdInventory = Record<string, number>;

export function buildYccdInventory(
  pool: Question[],
  parts: YccdPart[],
  resolvers: YccdResolvers,
  exclude?: Set<string>,
): YccdInventory {
  const inv: YccdInventory = {};
  const seen: Record<string, Set<string>> = {}; // key → set of normalised content
  for (const q of pool) {
    if (exclude?.has(q.id)) continue;
    const pl = placementOf(q, parts, resolvers);
    if (!pl) continue;
    const k = cellKey(pl.topicId, pl.partId, pl.bloom);
    const c = normContent(q.content);
    const set = (seen[k] ??= new Set());
    if (set.has(c)) continue; // dedup content within the cell
    set.add(c);
    inv[k] = (inv[k] ?? 0) + 1;
  }
  return inv;
}
