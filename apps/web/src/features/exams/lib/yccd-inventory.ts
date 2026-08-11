/**
 * Tồn kho (inventory) builder for the YCCĐ wizard — how many questions are
 * available per (outcome × type). Content-deduped within each bucket so the
 * matrix (step ③) can never promise more than the draw can actually deliver.
 */
import type { Question } from "@/features/question-bank/data/seed-questions";

import type { YccdType } from "../data/types";

import {
  normContent,
  questionHitsOutcome,
  yccdTypeOf,
} from "./generate-yccd";

export type YccdInventory = Record<string, Record<YccdType, number>>;

export function emptyBucket(): Record<YccdType, number> {
  return { mcq: 0, mcqMulti: 0, ds: 0, tl: 0 };
}

export function buildYccdInventory(
  pool: Question[],
  outcomeIds: string[],
  exclude?: Set<string>,
): YccdInventory {
  const inv: YccdInventory = {};
  for (const oid of outcomeIds) {
    const rec = emptyBucket();
    const seen: Record<YccdType, Set<string>> = {
      mcq: new Set(),
      mcqMulti: new Set(),
      ds: new Set(),
      tl: new Set(),
    };
    for (const q of pool) {
      if (exclude?.has(q.id)) continue;
      if (!questionHitsOutcome(q, oid)) continue;
      const t = yccdTypeOf(q.type);
      if (!t) continue;
      const c = normContent(q.content);
      if (seen[t].has(c)) continue; // dedup content within (outcome × type)
      seen[t].add(c);
      rec[t]++;
    }
    inv[oid] = rec;
  }
  return inv;
}
