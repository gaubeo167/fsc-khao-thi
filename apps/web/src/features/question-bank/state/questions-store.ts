"use client";

import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { create } from "zustand";

import { recordAudit } from "@/lib/audit/record";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { nextVersionFields, rootId, versionOf } from "@/lib/version";
import {
  patchDoc,
  sanitizeForFirestore,
  subscribeCollection,
  writeDoc,
} from "@/lib/firestore-sync";

import {
  SEED_QUESTIONS,
  type Question,
  type QuestionStatus,
} from "../data/seed-questions";

interface State {
  questions: Question[];
  hydrated: boolean;
}

interface Actions {
  /** Returns the created question with its new ID + timestamps assigned.
   *  The Firestore write happens in the background; local state is
   *  updated optimistically so callers can use the returned object
   *  immediately. */
  create(input: Omit<Question, "id" | "createdAt" | "updatedAt">): Question;
  update(id: string, patch: Partial<Question>): void;
  /** Soft-delete (sets archivedAt). Hard delete is forbidden —
   *  exam_form snapshots + audit + analytics permanently reference
   *  questions. */
  archive(id: string, actorUid: string, reason?: string): void;
  /** Inverse — clear archive fields. */
  restore(id: string, actorUid: string): void;
  /** Legacy alias — routes to archive(). */
  remove(id: string): void;
  /**
   * Clone the row as a new version in the same chain. The new row:
   *   - Gets a fresh id and `version = parent.version + 1`.
   *   - Shares the parent's `versionOfRootId`.
   *   - Starts in `status: "draft"` so it must go through the same
   *     approval flow the parent did (no shortcut around TBM duyệt).
   *   - Keeps `kho` from the parent.
   * The parent stays live — admins may archive it explicitly once the
   * new version is approved. Returns the new doc.
   */
  cloneAsNewVersion(
    sourceId: string,
    actorUid: string,
    reason?: string,
  ): Question | null;
  setStatus(id: string, status: QuestionStatus, approverId?: string, note?: string): void;
  findById(id: string): Question | undefined;
  /**
   * Fetch specific questions by ID and merge them into the store.
   *
   * Used by student sessions, which (for scale) do NOT subscribe to the
   * whole /questions collection — they load only the questions of the
   * homework / exam they're actually viewing. Skips IDs already present,
   * batches the rest by Firestore's 30-per-`in` limit. No-op in demo mode.
   */
  ensureQuestions(ids: string[]): Promise<void>;
  /** Internal — called by the Firestore snapshot listener. */
  _applySnapshot(rows: Question[]): void;
}

/** Project a question to a small audit-friendly subset — content is
 *  included (truncated) so we can detect "teacher changed the prompt",
 *  but full HTML / options arrays are summarised to keep audit rows
 *  small enough for the 1MB doc limit. */
function pickQuestionAuditFields(q: Question | undefined) {
  if (!q) return null;
  const contentPreview =
    typeof q.content === "string" ? q.content.slice(0, 500) : null;
  return {
    type: q.type,
    contentPreview,
    contentLength: typeof q.content === "string" ? q.content.length : 0,
    difficulty: q.difficulty,
    subjectId: q.subjectId,
    gradeId: q.gradeId,
    tags: q.tags,
    status: q.status,
    kho: q.kho,
  };
}

function nextId(existing: Question[]): string {
  const max = existing.reduce((acc, q) => {
    const m = /^Q-(\d+)$/.exec(q.id);
    return m ? Math.max(acc, Number.parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `Q-${String(max + 1).padStart(4, "0")}`;
}

// Pre-populate with seed only when Firebase isn't configured so the
// UI has demo data. With Firebase, wait for the snapshot to avoid the
// flash of stale / deleted seed entries on every load.
const INITIAL_QUESTIONS = isFirebaseConfigured() ? [] : SEED_QUESTIONS;

export const useQuestionsStore = create<State & Actions>()((set, get) => ({
  questions: INITIAL_QUESTIONS,
  hydrated: false,

  create(input) {
    const id = nextId(get().questions);
    const now = new Date().toISOString();
    const q = { ...input, id, createdAt: now, updatedAt: now } as Question;
    set({ questions: [q, ...get().questions] });
    writeDoc(COLLECTIONS.questions, id, sanitizeForFirestore(q as unknown as Record<string, unknown>));
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "create",
      after: pickQuestionAuditFields(q),
      campusId: q.campusId,
    });
    return q;
  },

  update(id, patch) {
    const before = get().questions.find((q) => q.id === id);
    const now = new Date().toISOString();
    set({
      questions: get().questions.map((q) =>
        q.id === id ? ({ ...q, ...patch, updatedAt: now } as Question) : q,
      ),
    });
    patchDoc(
      COLLECTIONS.questions,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "update",
      before: pickQuestionAuditFields(before),
      after: pickQuestionAuditFields(
        before ? ({ ...before, ...patch } as Question) : undefined,
      ),
      campusId: before?.campusId ?? null,
    });
  },

  archive(id, actorUid, reason) {
    const before = get().questions.find((q) => q.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<Question> = {
      archivedAt: now,
      archivedBy: actorUid,
      archiveReason: reason ?? null,
    } as Partial<Question>;
    set({
      questions: get().questions.map((q) =>
        q.id === id ? ({ ...q, ...patch, updatedAt: now } as Question) : q,
      ),
    });
    patchDoc(
      COLLECTIONS.questions,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "archive",
      before: pickQuestionAuditFields(before),
      after: pickQuestionAuditFields({ ...before, ...patch } as Question),
      campusId: before.campusId,
      reason,
    });
  },

  restore(id, actorUid) {
    const before = get().questions.find((q) => q.id === id);
    if (!before) return;
    const now = new Date().toISOString();
    const patch: Partial<Question> = {
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    } as Partial<Question>;
    set({
      questions: get().questions.map((q) =>
        q.id === id ? ({ ...q, ...patch, updatedAt: now } as Question) : q,
      ),
    });
    patchDoc(
      COLLECTIONS.questions,
      id,
      sanitizeForFirestore(patch as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "restore",
      before: pickQuestionAuditFields(before),
      after: pickQuestionAuditFields({ ...before, ...patch } as Question),
      campusId: before.campusId,
    });
  },

  remove(id) {
    get().archive(id, "system", "Legacy remove() call");
  },

  cloneAsNewVersion(sourceId, actorUid, reason) {
    const source = get().questions.find((q) => q.id === sourceId);
    if (!source) return null;
    const id = nextId(get().questions);
    const now = new Date().toISOString();
    const { version, versionOfRootId } = nextVersionFields(source);
    // Deep-clone via JSON to avoid sharing nested arrays (options,
    // subQuestions, etc.) between versions.
    const baseCopy = JSON.parse(JSON.stringify(source)) as Question;
    const clone = {
      ...baseCopy,
      id,
      version,
      versionOfRootId,
      // New versions start in draft and re-enter the approval workflow.
      status: "draft",
      approvedBy: null,
      rejectionNote: null,
      // Carry over kho + campusId; ownerId moves to the cloner.
      ownerId: actorUid,
      ownerName: source.ownerName,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      createdAt: now,
      updatedAt: now,
    } as Question;
    set({ questions: [clone, ...get().questions] });
    writeDoc(
      COLLECTIONS.questions,
      id,
      sanitizeForFirestore(clone as unknown as Record<string, unknown>),
    );
    recordAudit({
      entityType: "question",
      entityId: id,
      action: "lifecycle-transition",
      before: { sourceId, sourceVersion: versionOf(source) },
      after: {
        newVersion: version,
        rootId: rootId(source),
        status: "draft",
      },
      campusId: source.campusId,
      reason: reason ?? "Tạo phiên bản mới từ câu hỏi đã in-use",
    });
    return clone;
  },

  setStatus(id, status, approverId, note) {
    const before = get().questions.find((q) => q.id === id);
    const patch: Partial<Question> = {
      status,
      approvedBy: status === "approved" ? approverId ?? null : null,
      rejectionNote: status === "rejected" ? note ?? null : null,
    } as Partial<Question>;
    get().update(id, patch);
    if (status === "approved" || status === "rejected") {
      recordAudit({
        entityType: "question",
        entityId: id,
        action: status === "approved" ? "approve" : "reject",
        before: pickQuestionAuditFields(before),
        after: pickQuestionAuditFields(
          before ? ({ ...before, ...patch } as Question) : undefined,
        ),
        campusId: before?.campusId ?? null,
        reason: note,
      });
    }
  },

  findById(id) {
    return get().questions.find((q) => q.id === id);
  },

  async ensureQuestions(ids) {
    if (!isFirebaseConfigured()) return;
    const have = new Set(get().questions.map((q) => q.id));
    const missing = [...new Set(ids)].filter((id) => id && !have.has(id));
    if (missing.length === 0) return;
    const db = getDb();
    const fetched: Question[] = [];
    // Firestore allows at most 30 values in an `in` filter.
    for (let i = 0; i < missing.length; i += 30) {
      const chunk = missing.slice(i, i + 30);
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.questions),
          where(documentId(), "in", chunk),
        ),
      );
      for (const d of snap.docs) {
        fetched.push({ ...(d.data() as Question), id: d.id });
      }
    }
    if (fetched.length === 0) return;
    // Merge into the store, de-duping by id (keep the freshly fetched copy).
    const byId = new Map(get().questions.map((q) => [q.id, q]));
    for (const q of fetched) byId.set(q.id, q);
    set({ questions: [...byId.values()], hydrated: true });
  },

  _applySnapshot(rows) {
    set({ questions: rows, hydrated: true });
  },
}));

/**
 * Listen to /questions. Firestore security rules filter what the caller
 * can read: personal-kho is owner-only; campus-kho is readable by anyone
 * in the same campus. Returns the unsubscribe fn.
 *
 * On the empty-collection case (fresh project), we keep the seed array
 * already in state so dev UI isn't empty. The first non-empty snapshot
 * replaces it.
 */
export function subscribeQuestions(): Unsubscribe {
  return subscribeCollection<Question>({
    collectionName: COLLECTIONS.questions,
    fromDoc: (id, data) => ({ ...(data as Question), id }),
    onChange: (rows) => {
      const current = useQuestionsStore.getState().questions.length;
      // Empty collection on a fresh project: don't blow away seed data.
      if (rows.length === 0 && !useQuestionsStore.getState().hydrated) {
        useQuestionsStore.setState({ hydrated: true });
        return;
      }
      // Defensive: if the snapshot collapses from many → zero,
      // that's almost always a permission-denied snapshot or a
      // transient Firestore glitch (we've seen it after copy in
      // strict-rule mode). Skip the clobber and warn — the next
      // good snapshot will catch up. Real "delete all" workflows
      // still work because they happen one delete at a time.
      if (current > 0 && rows.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(
          "[questions-store] suspicious empty snapshot after non-empty state — ignored to avoid data flash.",
        );
        return;
      }
      useQuestionsStore.getState()._applySnapshot(rows);
    },
  });
}
