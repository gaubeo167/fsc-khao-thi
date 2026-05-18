"use client";

/**
 * Generic Firestore CRUD helpers used by content stores
 * (questions, blueprints, packages, shifts, …).
 *
 * Each store owns its local array as the read source so callers stay
 * synchronous, while writes are fire-and-forget toward Firestore. The
 * `onSnapshot` listener is the eventually-consistent source of truth:
 * when it fires, it replaces the local array with what the server has.
 *
 * Failure mode for demo scale: a failed write logs a warning and the
 * snapshot listener then erases the optimistic addition. UX-wise this
 * looks like "the item briefly appeared then vanished" — fine for
 * pilot, will need toast feedback at production scale.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";

import { getDb, isFirebaseConfigured } from "./firebase";

/**
 * Idempotent no-op unsubscribe used as a safe return value when Firebase
 * isn't configured. Lets demo-mode callers cleanly destructure
 * `const unsub = subscribeFoo(); ... unsub();` without conditionals.
 */
const NOOP_UNSUB: Unsubscribe = () => {
  /* no-op */
};

interface SubscribeArgs<T> {
  /** Firestore collection name. */
  collectionName: string;
  /** Optional query constraints (where/orderBy). Empty array = all docs allowed by rules. */
  constraints?: QueryConstraint[];
  /** Project a Firestore snapshot doc back to the store type T. */
  fromDoc: (id: string, data: DocumentData) => T;
  /** Called every time the snapshot fires with the full doc list. */
  onChange: (rows: T[]) => void;
  /** Optional error sink (defaults to console.warn). */
  onError?: (e: unknown) => void;
}

export function subscribeCollection<T>(args: SubscribeArgs<T>): Unsubscribe {
  // Demo / offline mode: no Firebase env → don't subscribe. Local Zustand
  // state (seed data) is the source of truth.
  if (!isFirebaseConfigured()) return NOOP_UNSUB;
  const q: Query<DocumentData> = args.constraints?.length
    ? query(collection(getDb(), args.collectionName), ...args.constraints)
    : query(collection(getDb(), args.collectionName));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => args.fromDoc(d.id, d.data()));
      args.onChange(rows);
    },
    (err) => {
      if (args.onError) args.onError(err);
      // eslint-disable-next-line no-console
      else console.warn(`[firestore] subscribe ${args.collectionName}`, err);
    },
  );
}

/** Background `setDoc` with logging on failure. Caller does not await.
 *  Silently skips when Firebase isn't configured (demo / offline mode). */
export function writeDoc(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
): void {
  if (!isFirebaseConfigured()) return;
  setDoc(doc(getDb(), collectionName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[firestore] setDoc ${collectionName}/${id} failed`, e);
  });
}

/** Background `updateDoc` with logging. No-ops in demo mode. */
export function patchDoc(
  collectionName: string,
  id: string,
  patch: Record<string, unknown>,
): void {
  if (!isFirebaseConfigured()) return;
  updateDoc(doc(getDb(), collectionName, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[firestore] updateDoc ${collectionName}/${id} failed`, e);
  });
}

/** Background `deleteDoc` with logging. No-ops in demo mode. */
export function removeDoc(collectionName: string, id: string): void {
  if (!isFirebaseConfigured()) return;
  deleteDoc(doc(getDb(), collectionName, id)).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[firestore] deleteDoc ${collectionName}/${id} failed`, e);
  });
}

/**
 * Strip values Firestore can't serialise — `undefined` is the main one
 * (Firestore SDK throws). Recurses through arrays + plain objects.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForFirestore(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}
