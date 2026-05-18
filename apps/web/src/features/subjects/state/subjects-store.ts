"use client";

import type { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

import { isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import {
  patchDoc,
  removeDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import { SEED_SUBJECTS, type Subject } from "../data/seed-subjects";
import { SEED_TOC, type TocNode } from "../data/seed-toc";

interface State {
  subjects: Subject[];
  tocNodes: TocNode[];
  hydrated: boolean;
}

interface Actions {
  createSubject(input: Omit<Subject, "id" | "createdAt">): Subject;
  updateSubject(id: string, patch: Partial<Subject>): void;
  removeSubject(id: string): void;

  createTocNode(
    input: Omit<TocNode, "id" | "order"> & { order?: number },
  ): TocNode;
  updateTocNode(id: string, patch: Partial<TocNode>): void;
  removeTocNode(id: string): void;

  reorderTocNode(
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ): void;

  tocFor(subjectId: string, gradeId: string | null): TocNode[];
  tocChildrenOf(
    parentId: string | null,
    subjectId: string,
    gradeId: string | null,
  ): TocNode[];

  _applySubjects(rows: Subject[]): void;
  _applyTocNodes(rows: TocNode[]): void;
}

function nextId(existing: { id: string }[], prefix: string): string {
  const max = existing.reduce((acc, x) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

const INITIAL_SUBJECTS = isFirebaseConfigured() ? [] : SEED_SUBJECTS;
const INITIAL_TOC = isFirebaseConfigured() ? [] : SEED_TOC;

export const useSubjectsStore = create<State & Actions>()((set, get) => ({
  subjects: INITIAL_SUBJECTS,
  tocNodes: INITIAL_TOC,
  hydrated: false,

  createSubject(input) {
    const id = nextId(get().subjects, "subject-");
    const s: Subject = { ...input, id, createdAt: new Date().toISOString() };
    set({ subjects: [s, ...get().subjects] });
    writeDoc(
      COLLECTIONS.subjects,
      id,
      sanitizeForFirestore(s as unknown as Record<string, unknown>),
    );
    return s;
  },

  updateSubject(id, patch) {
    set({
      subjects: get().subjects.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
    patchDoc(
      COLLECTIONS.subjects,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  removeSubject(id) {
    const orphanToc = get().tocNodes.filter((n) => n.subjectId === id);
    set({
      subjects: get().subjects.filter((s) => s.id !== id),
      tocNodes: get().tocNodes.filter((n) => n.subjectId !== id),
    });
    removeDoc(COLLECTIONS.subjects, id);
    // Cascade-delete TOC nodes that hung off this subject.
    for (const n of orphanToc) removeDoc(COLLECTIONS.tocNodes, n.id);
  },

  createTocNode(input) {
    const id = nextId(get().tocNodes, "toc-");
    const siblings = get().tocNodes.filter(
      (n) =>
        n.subjectId === input.subjectId &&
        n.gradeId === input.gradeId &&
        n.parentId === input.parentId,
    );
    const order = input.order ?? siblings.length;
    const node: TocNode = { ...input, id, order };
    set({ tocNodes: [...get().tocNodes, node] });
    writeDoc(
      COLLECTIONS.tocNodes,
      id,
      sanitizeForFirestore(node as unknown as Record<string, unknown>),
    );
    return node;
  },

  updateTocNode(id, patch) {
    set({
      tocNodes: get().tocNodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      ),
    });
    patchDoc(
      COLLECTIONS.tocNodes,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
  },

  removeTocNode(id) {
    const all = get().tocNodes;
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
    set({ tocNodes: all.filter((n) => !toRemove.has(n.id)) });
    for (const rid of toRemove) removeDoc(COLLECTIONS.tocNodes, rid);
  },

  reorderTocNode(sourceId, targetId, position) {
    if (sourceId === targetId) return;
    const all = get().tocNodes;
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
      tocNodes: all.map((n) =>
        orderMap.has(n.id) ? { ...n, order: orderMap.get(n.id)! } : n,
      ),
    });
    // Persist the new order — write each shifted sibling individually.
    for (const [id, order] of orderMap.entries()) {
      patchDoc(COLLECTIONS.tocNodes, id, { order });
    }
  },

  tocFor(subjectId, gradeId) {
    return get().tocNodes.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
  },

  tocChildrenOf(parentId, subjectId, gradeId) {
    return get()
      .tocNodes.filter(
        (n) =>
          n.subjectId === subjectId &&
          n.gradeId === gradeId &&
          n.parentId === parentId,
      )
      .sort((a, b) => a.order - b.order);
  },

  _applySubjects(rows) {
    set({ subjects: rows, hydrated: true });
  },
  _applyTocNodes(rows) {
    set({ tocNodes: rows });
  },
}));

export function subscribeSubjects(): Unsubscribe {
  const unsubS = subscribeCollection<Subject>({
    collectionName: COLLECTIONS.subjects,
    fromDoc: (id, data) => ({ ...(data as Subject), id }),
    onChange: (rows) => {
      if (rows.length === 0 && !useSubjectsStore.getState().hydrated) {
        useSubjectsStore.setState({ hydrated: true });
        return;
      }
      useSubjectsStore.getState()._applySubjects(rows);
    },
  });
  const unsubT = subscribeCollection<TocNode>({
    collectionName: COLLECTIONS.tocNodes,
    fromDoc: (id, data) => ({ ...(data as TocNode), id }),
    onChange: (rows) => {
      if (rows.length === 0) return; // keep seed if empty
      useSubjectsStore.getState()._applyTocNodes(rows);
    },
  });
  return () => {
    unsubS();
    unsubT();
  };
}
