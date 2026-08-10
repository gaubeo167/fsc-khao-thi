"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  removeDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import type { Competency } from "../data/types";

interface State {
  competencies: Competency[];
  hydrated: boolean;
}

interface Actions {
  createCompetency(
    input: Omit<Competency, "id" | "order" | "createdAt" | "updatedAt"> & {
      order?: number;
    },
  ): Competency;
  updateCompetency(id: string, patch: Partial<Competency>): void;
  removeCompetency(id: string): void;

  reorderCompetency(
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ): void;

  competenciesFor(subjectId: string, gradeId: string | null): Competency[];
  competencyChildrenOf(
    parentId: string | null,
    subjectId: string,
    gradeId: string | null,
  ): Competency[];
  competencyById(id: string): Competency | undefined;

  _apply(rows: Competency[]): void;
}

function nextId(existing: { id: string }[], prefix: string): string {
  const max = existing.reduce((acc, x) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

export const useCompetenciesStore = create<State & Actions>()((set, get) => ({
  competencies: [],
  hydrated: false,

  createCompetency(input) {
    const id = nextId(get().competencies, "cmp-");
    const siblings = get().competencies.filter(
      (n) =>
        n.subjectId === input.subjectId &&
        n.gradeId === input.gradeId &&
        n.parentId === input.parentId,
    );
    const now = new Date().toISOString();
    const node: Competency = {
      ...input,
      id,
      order: input.order ?? siblings.length,
      createdAt: now,
      updatedAt: now,
    };
    set({ competencies: [...get().competencies, node] });
    writeDoc(
      COLLECTIONS.competencies,
      id,
      sanitizeForFirestore(node as unknown as Record<string, unknown>),
    );
    return node;
  },

  updateCompetency(id, patch) {
    const next = { ...patch, updatedAt: new Date().toISOString() };
    set({
      competencies: get().competencies.map((n) =>
        n.id === id ? { ...n, ...next } : n,
      ),
    });
    patchDoc(
      COLLECTIONS.competencies,
      id,
      sanitizeForFirestore(next as Record<string, unknown>),
    );
  },

  removeCompetency(id) {
    const all = get().competencies;
    // Cascade to descendants.
    const toRemove = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of all) {
        if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      }
    }
    set({ competencies: all.filter((n) => !toRemove.has(n.id)) });
    for (const rid of toRemove) removeDoc(COLLECTIONS.competencies, rid);
  },

  reorderCompetency(sourceId, targetId, position) {
    if (sourceId === targetId) return;
    const all = get().competencies;
    const source = all.find((n) => n.id === sourceId);
    const target = all.find((n) => n.id === targetId);
    if (!source || !target) return;
    if (
      source.parentId !== target.parentId ||
      source.subjectId !== target.subjectId ||
      source.gradeId !== target.gradeId
    ) {
      return;
    }
    const siblings = all
      .filter(
        (n) =>
          n.subjectId === source.subjectId &&
          n.gradeId === source.gradeId &&
          n.parentId === source.parentId,
      )
      .sort((a, b) => a.order - b.order);
    const withoutSource = siblings.filter((n) => n.id !== sourceId);
    const targetIdx = withoutSource.findIndex((n) => n.id === targetId);
    if (targetIdx < 0) return;
    const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
    withoutSource.splice(insertIdx, 0, source);
    const orderMap = new Map(withoutSource.map((n, idx) => [n.id, idx]));
    set({
      competencies: all.map((n) =>
        orderMap.has(n.id) ? { ...n, order: orderMap.get(n.id)! } : n,
      ),
    });
    for (const [id, order] of orderMap.entries()) {
      patchDoc(COLLECTIONS.competencies, id, { order });
    }
  },

  competenciesFor(subjectId, gradeId) {
    return get().competencies.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
  },

  competencyChildrenOf(parentId, subjectId, gradeId) {
    return get()
      .competencies.filter(
        (n) =>
          n.subjectId === subjectId &&
          n.gradeId === gradeId &&
          n.parentId === parentId,
      )
      .sort((a, b) => a.order - b.order);
  },

  competencyById(id) {
    return get().competencies.find((n) => n.id === id);
  },

  _apply(rows) {
    set({ competencies: rows, hydrated: true });
  },
}));

export function subscribeCompetencies(): Unsubscribe {
  return subscribeCollection<Competency>({
    collectionName: COLLECTIONS.competencies,
    fromDoc: (id, data) => ({ ...(data as Competency), id }),
    onChange: (rows) => useCompetenciesStore.getState()._apply(rows),
  });
}
